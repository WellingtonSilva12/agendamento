const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());

// --- Configuração ---
const DB_FILE = path.join(__dirname, 'agendamentos.db');
const JWT_SECRET = process.env.JWT_SECRET || 'sua-chave-super-secreta-mude-isso';
const SALT_ROUNDS = 10;

// --- Configuração do Banco de Dados ---
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error("Erro ao abrir o banco de dados", err.message);
  } else {
    console.log("Conectado ao banco de dados SQLite.");
  }
});

// --- Inicialização do Banco de Dados ---
db.serialize(() => {
  // Tabela de Usuários ATUALIZADA
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      nome TEXT NOT NULL,
      matricula TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      funcao TEXT,
      role TEXT NOT NULL CHECK(role IN ('admin', 'user')) DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Notebooks
  db.run(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      patrimonio TEXT UNIQUE,
      status TEXT NOT NULL CHECK(status IN ('disponivel', 'em_manutencao', 'inativo')),
      inativado_em TEXT,
      atualizado_em TEXT,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Tabela de Reservas
  db.run(`
    CREATE TABLE IF NOT EXISTS reservas (
      id TEXT PRIMARY KEY,
      responsavel TEXT NOT NULL,
      data_inicio TEXT NOT NULL,
      data_fim TEXT NOT NULL,
      criado_em TEXT DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT
    )
  `);

  // Tabela de junção para reservas e notebooks
  db.run(`
    CREATE TABLE IF NOT EXISTS reserva_notebooks (
      reserva_id TEXT NOT NULL,
      notebook_id INTEGER NOT NULL,
      FOREIGN KEY(reserva_id) REFERENCES reservas(id) ON DELETE CASCADE,
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id),
      PRIMARY KEY(reserva_id, notebook_id)
    )
  `);

  // Inserir notebook inicial se a tabela estiver vazia
  db.get("SELECT COUNT(*) as count FROM notebooks", (err, row) => {
    if (err) return;
    if (row.count === 0) {
      db.run(
        "INSERT INTO notebooks (nome, status) VALUES (?, ?)",
        ['Notebook 01', 'disponivel']
      );
    }
  });
});

// --- Funções Auxiliares do Banco de Dados (com Promises) ---
function dbAll(query, params = []) {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function dbRun(query, params = []) {
  return new Promise((resolve, reject) => {
    db.run(query, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function dbGet(query, params = []) {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

// --- Funções de Validação ---
function validarData(data) {
  return data && !isNaN(new Date(data));
}

// --- Constantes ---
const STATUS_VALIDOS = ['disponivel', 'em_manutencao', 'inativo'];

// --- Middleware de Autenticação ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }
    req.user = user;
    next();
  });
};

// --- Rotas de Autenticação ---

// POST /api/auth/register - Registrar um novo usuário (ATUALIZADO)
app.post('/api/auth/register', async (req, res) => {
    const { username, password, nome, matricula, email, funcao, role = 'user' } = req.body;

    if (!username || !password || !nome || !email) {
        return res.status(400).json({ error: 'Usuário, senha, nome e email são obrigatórios.' });
    }

    try {
        const existingUser = await dbGet("SELECT id FROM users WHERE username = ? OR email = ? OR matricula = ?", [username, email, matricula]);
        if (existingUser) {
            return res.status(409).json({ error: 'Usuário, email ou matrícula já cadastrado.' });
        }
        
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        const result = await dbRun(
            "INSERT INTO users (username, password, nome, matricula, email, funcao, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [username, hashedPassword, nome, matricula, email, funcao, role]
        );

        const newUser = await dbGet("SELECT id, username, nome, email, funcao, role FROM users WHERE id = ?", [result.lastID]);

        res.status(201).json({ message: "Usuário criado com sucesso!", user: newUser });
    } catch (err) {
        console.error('Erro ao registrar usuário:', err);
        res.status(500).json({ error: 'Erro interno ao registrar usuário' });
    }
});


// POST /api/auth/login - Autenticar um usuário (ATUALIZADO)
app.post('/api/auth/login', async (req, res) => {
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
            role: user.role 
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        
        // Retorna mais dados do usuário no login
        res.json({ 
            message: "Login bem-sucedido!",
            token,
            user: {
                id: user.id,
                username: user.username,
                nome: user.nome,
                email: user.email,
                matricula: user.matricula,
                funcao: user.funcao,
                role: user.role
            }
        });
    } catch (err) {
        console.error('Erro ao fazer login:', err);
        res.status(500).json({ error: 'Erro interno ao fazer login' });
    }
});


// --- Rotas de Notebooks (sem alterações) ---
app.get('/api/notebooks', async (req, res) => {
    try {
      const notebooks = await dbAll("SELECT * FROM notebooks WHERE status != 'inativo'");
      res.json(notebooks);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar notebooks' });
    }
});
// ... (demais rotas de notebooks permanecem iguais)
app.post('/api/notebooks', authenticateToken, async (req, res) => {
  try {
    const { nome, patrimonio, status = 'disponivel' } = req.body;
    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }
    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({
        error: 'Status inválido. Os status válidos são: disponivel, em_manutencao, inativo.'
      });
    }
    if (patrimonio) {
      const existente = await dbGet(
        "SELECT id FROM notebooks WHERE patrimonio = ?",
        [patrimonio]
      );
      if (existente) {
        return res.status(409).json({
          error: 'Já existe um notebook com este número de patrimônio.'
        });
      }
    }
    const result = await dbRun(
      "INSERT INTO notebooks (nome, patrimonio, status) VALUES (?, ?, ?)",
      [nome, patrimonio, status]
    );
    const novoNotebook = await dbGet(
      "SELECT * FROM notebooks WHERE id = ?",
      [result.lastID]
    );
    res.status(201).json(novoNotebook);
  } catch (err) {
    console.error('Erro ao criar notebook:', err);
    res.status(500).json({ error: 'Erro interno ao criar notebook' });
  }
});

// --- Rotas de Reservas (sem alterações) ---
app.use('/api/reservas', authenticateToken);

app.post('/api/reservas', async (req, res) => {
  try {
    const { responsavel, data_inicio, data_fim, notebooks_ids } = req.body;

    if (!responsavel || !data_inicio || !data_fim || !notebooks_ids?.length) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    if (!validarData(data_inicio) || !validarData(data_fim)) {
      return res.status(400).json({ error: 'Formato de data inválido' });
    }
    if (new Date(data_fim) <= new Date(data_inicio)) {
      return res.status(400).json({ error: 'A data final deve ser posterior à data de início.' });
    }

    const placeholders = notebooks_ids.map(() => '?').join(',');
    const notebooks = await dbAll(
      `SELECT id, status FROM notebooks WHERE id IN (${placeholders})`,
      notebooks_ids
    );

    if (notebooks.length !== notebooks_ids.length) {
      const idsEncontrados = notebooks.map(n => n.id);
      const notebooksInvalidos = notebooks_ids.filter(id => !idsEncontrados.includes(id));
      return res.status(404).json({
        error: `Notebooks não encontrados: ${notebooksInvalidos.join(', ')}`
      });
    }

    const notebooksIndisponiveis = notebooks.filter(n => n.status !== 'disponivel').map(n => n.id);
    if (notebooksIndisponiveis.length > 0) {
      return res.status(409).json({
        error: `Notebooks indisponíveis (em manutenção ou inativos): ${notebooksIndisponiveis.join(', ')}`
      });
    }
    
    const conflitos = await dbAll(`
      SELECT r.id as reserva_id, rn.notebook_id
      FROM reservas r
      JOIN reserva_notebooks rn ON r.id = rn.reserva_id
      WHERE rn.notebook_id IN (${placeholders})
      AND NOT (r.data_fim <= ? OR r.data_inicio >= ?)
    `, [...notebooks_ids, data_inicio, data_fim]);

    if (conflitos.length > 0) {
      return res.status(409).json({
        error: 'Conflito de horário. Os notebooks solicitados já estão reservados para o período.',
        conflitos
      });
    }

    const reservaId = uuidv4();
    await dbRun(
      "INSERT INTO reservas (id, responsavel, data_inicio, data_fim) VALUES (?, ?, ?, ?)",
      [reservaId, responsavel, data_inicio, data_fim]
    );

    for (const notebookId of notebooks_ids) {
      await dbRun(
        "INSERT INTO reserva_notebooks (reserva_id, notebook_id) VALUES (?, ?)",
        [reservaId, notebookId]
      );
    }

    const novaReserva = await dbGet("SELECT * FROM reservas WHERE id = ?", [reservaId]);
    novaReserva.notebooks = await dbAll(`SELECT id, nome, patrimonio FROM notebooks WHERE id IN (${placeholders})`, notebooks_ids);

    res.status(201).json(novaReserva);
  } catch (err) {
    console.error('Erro ao criar reserva:', err);
    res.status(500).json({ error: 'Erro ao criar reserva' });
  }
});

app.get('/api/reservas', async (req, res) => {
  try {
    const { notebook_id, responsavel } = req.query;
    
    let query = `
      SELECT r.id, r.responsavel, r.data_inicio, r.data_fim, r.criado_em,
             GROUP_CONCAT(n.id) as notebook_ids,
             GROUP_CONCAT(n.nome) as notebook_nomes
      FROM reservas r
      LEFT JOIN reserva_notebooks rn ON r.id = rn.reserva_id
      LEFT JOIN notebooks n ON rn.notebook_id = n.id
    `;
    const params = [];
    let whereClauses = [];

    if (notebook_id) {
        whereClauses.push(`r.id IN (SELECT reserva_id FROM reserva_notebooks WHERE notebook_id = ?)`);
        params.push(notebook_id);
    }

    if (responsavel) {
      whereClauses.push("r.responsavel LIKE ?");
      params.push(`%${responsavel}%`);
    }

    if (whereClauses.length > 0) {
        query += " WHERE " + whereClauses.join(" AND ");
    }

    query += " GROUP BY r.id ORDER BY r.data_inicio DESC";

    const reservas = await dbAll(query, params);
    
    const reservasFormatadas = reservas.map(reserva => ({
      id: reserva.id,
      responsavel: reserva.responsavel,
      data_inicio: reserva.data_inicio,
      data_fim: reserva.data_fim,
      criado_em: reserva.criado_em,
      notebooks: reserva.notebook_ids 
        ? reserva.notebook_ids.split(',').map((id, index) => ({
            id: Number(id),
            nome: reserva.notebook_nomes.split(',')[index]
          }))
        : []
    }));

    res.json(reservasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar reservas:', err);
    res.status(500).json({ error: 'Erro ao buscar reservas' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await dbGet("SELECT * FROM reservas WHERE id = ?", [id]);
    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada' });
    }
    await dbRun("DELETE FROM reservas WHERE id = ?", [id]);
    res.status(200).json({ message: 'Reserva cancelada com sucesso', reserva_id: id });
  } catch (err) {
    console.error('Erro ao cancelar reserva:', err);
    res.status(500).json({ error: 'Erro ao cancelar reserva' });
  }
});


// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nServidor rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('\nConexão com o banco de dados fechada.');
    process.exit(0);
  });
});
