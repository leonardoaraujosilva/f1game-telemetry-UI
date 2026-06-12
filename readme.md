Aqui está um modelo de `README.md` direto e estruturado para o seu projeto, focado nos passos de configuração que você mencionou.

# F1 Telemetry Overlay for OBS

Node.js application to capture UDP telemetry data from EA Sports F1 games and render it as an overlay inside OBS Studio.

## Prerequisites

* [Node.js](https://nodejs.org/) (LTS version recommended)
* F1 25 / F1 26
* [OBS Studio](https://obsproject.com/)

## Installation

1. Clone or download this repository.
2. Open your terminal in the project root folder.
3. Install dependencies:
```bash
   npm install
```

## Setup & Running

### 1. Start the Node.js Server

Run the telemetry listener script to start capturing UDP packets and serving the data:

```bash
node index.js
```

### 2. Configure In-Game UDP Telemetry

1. Open your F1 game.
2. Go to **Settings** > **Telemetry Settings**.
3. Set **Telemetry** to **ON**.
4. Set **UDP IP Address** to `127.0.0.1` (or `localhost`).
5. Set **UDP Port** to the port configured in your script (usually `20777`).
6. Set **UDP Format** to either **2025** or **2026**, depending on which season/game you are currently racing.

### 3. Add to OBS Studio

1. Open OBS Studio.
2. In the **Sources** dock, click the `+` icon and select **Browser**.
3. Name the source (e.g., "F1 Telemetry").
4. Check the **Local file** box and browse to select the `index.html` (or the main HTML file) from this project folder.
* *Alternative:* If your Node server hosts the page, uncheck "Local file" and enter the URL (e.g., `http://localhost:3000`).


5. Set the Width and Height according to your stream output (e.g., `1920` x `1080`).
6. Click **OK**.
