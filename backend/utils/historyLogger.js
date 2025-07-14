// utils/historyLogger.js
const fs = require('fs').promises;
const path = require('path');
const HISTORY_FILE = path.join(__dirname, '..', 'historico_reservas.json');

async function logToHistory(action, data) {
  try {
    let history = [];
    try {
      const fileContent = await fs.readFile(HISTORY_FILE, 'utf-8');
      history = JSON.parse(fileContent);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    const logEntry = {
      action: action,
      timestamp: new Date().toISOString(),
      data: data
    };
    history.unshift(logEntry);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
  } catch (error) {
    console.error("Falha ao registrar histórico:", error);
  }
}

module.exports = { logToHistory };