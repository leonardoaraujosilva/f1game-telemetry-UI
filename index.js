const dgram = require('dgram');
const WebSocket = require('ws');

const UDP_PORT = 20777;
const WS_PORT = 8080;
const HEADER_SIZE = 29;

const udp = dgram.createSocket('udp4');
const wss = new WebSocket.Server({ port: WS_PORT });

const state = {
    playerIdx: 0,
    session: {},
    lapData: [],
    participants: [],
    carTelemetry: [],
    carTelemetry2: [],
    carStatus: [],
    carDamage: []
};

let currentSessionUID = null;

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

function parseLapData(buffer, format) {
    const cars = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 57;
    const maxCars = Math.floor((buffer.length - HEADER_SIZE) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        const deltaFrontMS = buffer.readUInt16LE(offset + 14);
        const deltaFrontMin = buffer.readUInt8(offset + 16);
        const deltaLeaderMS = buffer.readUInt16LE(offset + 17);
        const deltaLeaderMin = buffer.readUInt8(offset + 19);

        cars.push({
            m_lastLapTimeInMS: buffer.readUInt32LE(offset + 0),
            m_currentLapTimeInMS: buffer.readUInt32LE(offset + 4),
            m_deltaToCarInFrontInMS: (deltaFrontMin * 60000) + deltaFrontMS,
            m_deltaToRaceLeaderInMS: (deltaLeaderMin * 60000) + deltaLeaderMS,
            m_lapDistance: buffer.readFloatLE(offset + 20),
            m_totalDistance: buffer.readFloatLE(offset + 24),
            m_carPosition: buffer.readUInt8(offset + 32),
            m_currentLapNum: buffer.readUInt8(offset + 33),
            m_resultStatus: buffer.readUInt8(offset + 45)
        });

        offset += CAR_SIZE;
    }

    return { m_lapData: cars };
}

function parseParticipants(buffer, format) {
    const participants = [];
    let offset = HEADER_SIZE + 1; // numActiveCars
    const is26 = format === 2026;
    const CAR_SIZE = is26 ? 60 : 57;
    const maxCars = Math.floor((buffer.length - (HEADER_SIZE + 1)) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        const teamOffset = is26 ? 5 : 3;
        const nameOffset = is26 ? 10 : 7;
        const nameBuffer = buffer.slice(offset + nameOffset, offset + nameOffset + 32);

        participants.push({
            m_teamId: is26 ? buffer.readUInt16LE(offset + teamOffset) : buffer.readUInt8(offset + teamOffset),
            m_name: nameBuffer.toString('utf8').replace(/\0/g, '').trim() || `CAR ${i + 1}`
        });

        offset += CAR_SIZE;
    }

    return { m_participants: participants };
}

function parseTelemetry(buffer, format) {
    const telemetry = [];
    let offset = HEADER_SIZE;
    const is26 = format === 2026;
    const CAR_SIZE = is26 ? 59 : 60;
    const maxCars = Math.floor((buffer.length - HEADER_SIZE) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        telemetry.push({
            m_speed: buffer.readUInt16LE(offset + 0),
            m_throttle: buffer.readFloatLE(offset + 2),
            m_steer: buffer.readFloatLE(offset + 6),
            m_brake: buffer.readFloatLE(offset + 10),
            m_gear: buffer.readInt8(offset + 15),
            m_engineRPM: buffer.readUInt16LE(offset + 16),
            m_drs: buffer.readUInt8(offset + 18),
            m_revLightsPercent: buffer.readUInt8(offset + 19),
            m_tyresInnerTemperature: [
                buffer.readUInt8(offset + 34), // RL
                buffer.readUInt8(offset + 35), // RR
                buffer.readUInt8(offset + 36), // FL
                buffer.readUInt8(offset + 37)  // FR
            ]
        });

        offset += CAR_SIZE;
    }

    return { m_carTelemetryData: telemetry };
}

function parseCarTelemetry2(buffer, format) {
    const telemetry2 = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 10;
    const maxCars = Math.floor((buffer.length - HEADER_SIZE) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        telemetry2.push({
            m_activeAeroMode: buffer.readUInt8(offset + 0),
            m_activeAeroAvailable: buffer.readUInt8(offset + 1),
            m_overtakeAvailable: buffer.readUInt8(offset + 4),
            m_overtakeActive: buffer.readUInt8(offset + 5),
            m_2026Regulations: buffer.readUInt8(offset + 8),
            m_drivingWrongWay: buffer.readUInt8(offset + 9)
        });
        offset += CAR_SIZE;
    }

    return { m_carTelemetry2Data: telemetry2 };
}

function parseCarStatus(buffer, format) {
    const status = [];
    let offset = HEADER_SIZE;
    const is26 = format === 2026;
    const CAR_SIZE = is26 ? 59 : 55;
    const maxCars = Math.floor((buffer.length - HEADER_SIZE) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        status.push({
            m_fuelInTank: buffer.readFloatLE(offset + 5),
            m_fuelCapacity: buffer.readFloatLE(offset + 9),
            m_drsAllowed: buffer.readUInt8(offset + 22),
            m_drsActivationDistance: buffer.readUInt16LE(offset + 23),
            m_actualTyreCompound: buffer.readUInt8(offset + 25),
            m_visualTyreCompound: buffer.readUInt8(offset + 26),
            m_tyresAgeLaps: buffer.readUInt8(offset + 27),
            m_ersStoreEnergy: buffer.readFloatLE(offset + 37),
            m_ersDeployMode: buffer.readUInt8(offset + 41),
            m_ersDeployedThisLap: buffer.readFloatLE(is26 ? offset + 54 : offset + 50)
        });

        offset += CAR_SIZE;
    }

    return { m_carStatusData: status };
}

function parseTyreSets(msg, format) {
    const buffer = msg;
    const HEADER_SIZE = 29;
    const carIdx = buffer.readUInt8(HEADER_SIZE);
    
    // TyreSetData is 9 bytes. There are 20 tyre sets.
    const fittedIdxOffset = HEADER_SIZE + 1 + (20 * 9);
    const fittedIdx = buffer.readUInt8(fittedIdxOffset);
    
    let lapDeltaTime = 0;
    if (fittedIdx < 20) {
        const fittedOffset = HEADER_SIZE + 1 + (fittedIdx * 9);
        lapDeltaTime = buffer.readInt16LE(fittedOffset + 7);
    }
    
    return {
        m_carIdx: carIdx,
        m_lapDeltaTime: lapDeltaTime
    };
}

function parseCarDamage(buffer, format) {
    const damage = [];
    let offset = HEADER_SIZE;
    const CAR_SIZE = 46;
    const maxCars = Math.floor((buffer.length - HEADER_SIZE) / CAR_SIZE);

    for (let i = 0; i < maxCars; i++) {
        damage.push({
            m_tyresWear: [
                buffer.readFloatLE(offset + 0), // RL
                buffer.readFloatLE(offset + 4), // RR
                buffer.readFloatLE(offset + 8), // FL
                buffer.readFloatLE(offset + 12) // FR
            ]
        });

        offset += CAR_SIZE;
    }

    return { m_carDamageData: damage };
}

let receivedPackets = new Set();
let lastPacketBroadcast = 0;

udp.on('message', (msg) => {
    try {
        const header = readHeader(msg);
        state.playerIdx = header.playerCarIndex;
        
        receivedPackets.add(header.packetId);
        const now = Date.now();
        if (now - lastPacketBroadcast > 2000) {
            broadcast({ type: 'DEBUG_INFO', data: {
                format: header.packetFormat,
                packets: Array.from(receivedPackets)
            }});
            lastPacketBroadcast = now;
        }

        if (currentSessionUID !== header.sessionUID) {
            currentSessionUID = header.sessionUID;
            state.lapData = [];
            state.participants = [];
            state.carTelemetry = [];
            state.carTelemetry2 = [];
            state.carStatus = [];
            state.session = {};
            state.carDamage = [];
            broadcast({ type: 'RESET' });
        }

        let payload = null;
        const format = header.packetFormat;
        state.format = format; // Store the current format in state for UI layout selection

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
                payload = parseLapData(msg, format);
                state.lapData = payload.m_lapData;
                broadcast({
                    type: 'LAP_DATA',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 4:
                payload = parseParticipants(msg, format);
                state.participants = payload.m_participants;
                broadcast({
                    type: 'PARTICIPANTS',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 6:
                payload = parseTelemetry(msg, format);
                state.carTelemetry = payload.m_carTelemetryData;
                broadcast({
                    type: 'TELEMETRY',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 7:
                payload = parseCarStatus(msg, format);
                state.carStatus = payload.m_carStatusData;
                broadcast({
                    type: 'CAR_STATUS',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 10:
                payload = parseCarDamage(msg, format);
                state.carDamage = payload.m_carDamageData;
                broadcast({
                    type: 'CAR_DAMAGE',
                    data: payload,
                    playerIdx: state.playerIdx
                });
                break;

            case 12: // Tyre Sets
                payload = parseTyreSets(msg, format);
                if (!state.tyreSets) state.tyreSets = {};
                state.tyreSets[payload.m_carIdx] = payload;
                broadcast({
                    type: 'TYRE_SETS',
                    data: state.tyreSets,
                    playerIdx: state.playerIdx
                });
                break;

            case 16: // Car Telemetry 2
                payload = parseCarTelemetry2(msg, format);
                state.carTelemetry2 = payload.m_carTelemetry2Data;
                broadcast({
                    type: 'TELEMETRY2',
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