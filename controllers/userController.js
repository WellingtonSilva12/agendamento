// controllers/userController.js
const { dbAll } = require('../config/database');
const fs = require('fs').promises;
const path = require('path');
const HISTORY_FILE = path.join(__dirname, '..', 'historico_reservas.json');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await dbAll("SELECT id, username, nome, matricula, email, funcao, role FROM users");
    res.json(users);
  } catch (error) {
    console.error("Erro ao listar usuários:", error);
    res.status(500).json({ error: 'Falha ao listar usuários.' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const historyContent = await fs.readFile(HISTORY_FILE, 'utf-8');
    res.json(JSON.parse(historyContent));
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Se o arquivo não existe, retorna um array vazio.
      return res.json([]);
    }
    console.error("Erro ao ler arquivo de histórico:", error);
    res.status(500).json({ error: 'Falha ao ler o histórico.' });
  }
};