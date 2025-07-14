// controllers/authController.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../config/database');

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET;

exports.register = async (req, res) => {
  const { username, password, nome, matricula, email, funcao, role = 'user' } = req.body;

  if (!username || !password || !nome || !email) {
    return res.status(400).json({ error: 'Usuário, senha, nome e email são obrigatórios.' });
  }

  try {
    const existingUser = await dbGet(
      "SELECT id FROM users WHERE username = ? OR email = ? OR (matricula = ? AND matricula IS NOT NULL AND matricula != '')", 
      [username, email, matricula]
    );

    if (existingUser) {
      return res.status(409).json({ error: 'Usuário, email ou matrícula já cadastrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    
    await dbRun(
      "INSERT INTO users (username, password, nome, matricula, email, funcao, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [username, hashedPassword, nome, matricula, email, funcao, role]
    );

    res.status(201).json({ message: "Usuário criado com sucesso!" });
  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao registrar usuário' });
  }
};

exports.login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const user = await dbGet("SELECT * FROM users WHERE username = ?", [username]);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Credenciais inválidas.' });
    }

    const payload = { 
      id: user.id, 
      username: user.username, 
      nome: user.nome,
      matricula: user.matricula, 
      role: user.role 
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });

    res.json({ message: "Login bem-sucedido!", token, user: payload });
  } catch (err) {
    console.error('Erro ao fazer login:', err);
    res.status(500).json({ error: 'Erro interno ao fazer login' });
  }
};