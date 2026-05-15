const dgram = require('dgram');
const WebSocket = require('ws');

const UDP_PORT = 20777;
const WS_PORT = 8080;
const MAX_CARS = 22;
const HEADER_SIZE = 29;

const udp = dgram.createSocket('udp4');
const wss = new WebSocket.Server({ port: WS_PORT });

const state = {
    playerIdx: 0,
    session: {},
    lapData: [],
    participants: [],
    carTelemetry: [],
    carStatus: []
};

function broadcast(payload) {
    const message = JSON.stringify(payload);

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function readHeader(buffer) {
    return {
        packetFormat: buffer.readUInt16LE(0),
        gameYear: buffer.readUInt8(2),
        gameMajorVersion: buffer.readUInt8(3),
        gameMinorVersion: buffer.readUInt8(4),
        packetVersion: buffer.readUInt8(5),
        packetId: buffer.readUInt8(6),
        sessionUID: Number(buffer.readBigUInt64LE(7)),
        sessionTime: buffer.readFloatLE(15),
        frameIdentifier: buffer.readUInt32LE(19),
        overallFrameIdentifier: buffer.readUInt32LE(23),
        playerCarIndex: buffer.readUInt8(27)
    };
}

function parseSession(buffer) {
    return {
        m_weather: buffer.readUInt8(29),
        m_trackTemperature: buffer.readInt8(30),
        m_airTemperature: buffer.readInt8(31),
        m_totalLaps: buffer.readUInt8(32),
        m_trackLength: buffer.readUInt16LE(33),
        m_sessionType: buffer.readUInt8(35),
        m_trackId: buffer.readInt8(36),
        m_gamePaused: buffer.readUInt8(43)
    };
}

function parseLapData(buffer) {
    const cars = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 57;

    for (let i = 0; i < MAX_CARS; i++) {
        cars.push({
            m_lastLapTimeInMS: buffer.readUInt32LE(offset + 0),
            m_currentLapTimeInMS: buffer.readUInt32LE(offset + 4),
            m_totalDistance: buffer.readFloatLE(offset + 24),
            m_carPosition: buffer.readUInt8(offset + 32),
            m_currentLapNum: buffer.readUInt8(offset + 33),
            m_resultStatus: buffer.readUInt8(offset + 45)
        });

        offset += CAR_SIZE;
    }

    return { m_lapData: cars };
}

function parseParticipants(buffer) {
    const participants = [];
    let offset = HEADER_SIZE + 1; // numActiveCars
    const CAR_SIZE = 57;

    for (let i = 0; i < MAX_CARS; i++) {
        const nameBuffer = buffer.slice(offset + 7, offset + 39);

        participants.push({
            m_name: nameBuffer.toString('utf8').replace(/\0/g, '').trim() || `CAR ${i + 1}`
        });

        offset += CAR_SIZE;
    }

    return { m_participants: participants };
}

function parseTelemetry(buffer) {
    const telemetry = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 60;

    for (let i = 0; i < MAX_CARS; i++) {
        telemetry.push({
            m_speed: buffer.readUInt16LE(offset + 0),
            m_throttle: buffer.readFloatLE(offset + 2),
            m_steer: buffer.readFloatLE(offset + 6),
            m_brake: buffer.readFloatLE(offset + 10),
            m_gear: buffer.readInt8(offset + 15),
            m_engineRPM: buffer.readUInt16LE(offset + 16),
            m_drs: buffer.readUInt8(offset + 18),
            m_tyresSurfaceTemperature: [
                buffer.readUInt8(offset + 30), // RL
                buffer.readUInt8(offset + 31), // RR
                buffer.readUInt8(offset + 32), // FL
                buffer.readUInt8(offset + 33)  // FR
            ]
        });

        offset += CAR_SIZE;
    }

    return { m_carTelemetryData: telemetry };
}

function parseCarStatus(buffer) {
    const status = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 55;

    for (let i = 0; i < MAX_CARS; i++) {
        status.push({
            m_fuelInTank: buffer.readFloatLE(offset + 5),
            m_fuelCapacity: buffer.readFloatLE(offset + 9),
            m_drsAllowed: buffer.readUInt8(offset + 22),
            m_visualTyreCompound: buffer.readUInt8(offset + 26),
            m_tyresAgeLaps: buffer.readUInt8(offset + 27),
            m_ersStoreEnergy: buffer.readFloatLE(offset + 37)
        });

        offset += CAR_SIZE;
    }

    return { m_carStatusData: status };
}

udp.on('message', (msg) => {
    try {
        const header = readHeader(msg);
        state.playerIdx = header.playerCarIndex;

        let payload = null;

        switch (header.packetId) {
            case 1:
                payload = parseSession(msg);
                state.session = payload;
                broadcast({
                    type: 'SESSION',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 2:
                payload = parseLapData(msg);
                state.lapData = payload.m_lapData;
                broadcast({
                    type: 'LAP_DATA',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 4:
                payload = parseParticipants(msg);
                state.participants = payload.m_participants;
                broadcast({
                    type: 'PARTICIPANTS',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 6:
                payload = parseTelemetry(msg);
                state.carTelemetry = payload.m_carTelemetryData;
                broadcast({
                    type: 'TELEMETRY',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 7:
                payload = parseCarStatus(msg);
                state.carStatus = payload.m_carStatusData;
                broadcast({
                    type: 'CAR_STATUS',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;
        }

    } catch (error) {
        console.error('Erro ao processar pacote:', error.message);
    }
});

wss.on('connection', (ws) => {
    console.log('Frontend conectado');

    ws.send(JSON.stringify({
        type: 'FULL_STATE',
        data: state,
        playerIdx: state.playerIdx
    }));
});

udp.bind(UDP_PORT, () => {
    console.log(`UDP ouvindo na porta ${UDP_PORT}`);
});

console.log(`WebSocket disponível em ws://localhost:${WS_PORT}`);