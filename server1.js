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
  // Tabela de Usuários
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
        
        await dbRun(
            "INSERT INTO users (username, password, nome, matricula, email, funcao, role) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [username, hashedPassword, nome, matricula, email, funcao, role]
        );
        res.status(201).json({ message: "Usuário criado com sucesso!" });
    } catch (err) {
        console.error('Erro ao registrar usuário:', err);
        res.status(500).json({ error: 'Erro interno ao registrar usuário' });
    }
});

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
            matricula: user.matricula,
            role: user.role 
        };

        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
        
        res.json({ 
            message: "Login bem-sucedido!",
            token,
            user: payload
        });
    } catch (err) {
        console.error('Erro ao fazer login:', err);
        res.status(500).json({ error: 'Erro interno ao fazer login' });
    }
});


// --- Rotas de Notebooks ---
app.get('/api/notebooks', async (req, res) => {
    try {
      const query = "SELECT * FROM notebooks";
      const notebooks = await dbAll(query);
      res.json(notebooks);
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar notebooks' });
    }
});

app.post('/api/notebooks', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    const { nome, patrimonio, status = 'disponivel' } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    
    if (patrimonio) {
        const existente = await dbGet("SELECT id FROM notebooks WHERE patrimonio = ? AND patrimonio IS NOT NULL AND patrimonio != ''", [patrimonio]);
        if (existente) return res.status(409).json({ error: 'Patrimônio já cadastrado.' });
    }
    
    const result = await dbRun("INSERT INTO notebooks (nome, patrimonio, status) VALUES (?, ?, ?)", [nome, patrimonio, status]);
    const novoNotebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [result.lastID]);
    res.status(201).json(novoNotebook);
  } catch (err) {
    console.error('Erro ao criar notebook:', err);
    res.status(500).json({ error: 'Erro interno ao criar notebook' });
  }
});

app.put('/api/notebooks/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    const { id } = req.params;
    const { nome, patrimonio, status } = req.body;
    
    const notebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    if (!notebook) return res.status(404).json({ error: 'Notebook não encontrado.' });
    
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

    if (patrimonio && patrimonio !== notebook.patrimonio) {
        const existente = await dbGet("SELECT id FROM notebooks WHERE patrimonio = ? AND patrimonio IS NOT NULL AND patrimonio != ''", [patrimonio]);
        if (existente) return res.status(409).json({ error: 'Patrimônio já cadastrado em outro notebook.' });
    }
    
    await dbRun("UPDATE notebooks SET nome = ?, patrimonio = ?, status = ?, atualizado_em = datetime('now') WHERE id = ?", [nome, patrimonio, status, id]);
    const notebookAtualizado = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    res.json(notebookAtualizado);

  } catch (err) {
      console.error('Erro ao atualizar notebook:', err);
      res.status(500).json({ error: 'Erro interno ao atualizar notebook.' });
  }
});

app.delete('/api/notebooks/:id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }
    const { id } = req.params;
    const notebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    if (!notebook) return res.status(404).json({ error: 'Notebook não encontrado.' });
    
    // Soft delete: muda o status para "inativo"
    await dbRun("UPDATE notebooks SET status = 'inativo', inativado_em = datetime('now') WHERE id = ?", [id]);
    res.status(200).json({ message: 'Notebook marcado como inativo.' });

  } catch (err) {
      console.error('Erro ao inativar notebook:', err);
      res.status(500).json({ error: 'Erro interno ao inativar notebook' });
  }
});


// --- Rotas de Reservas ---
app.use('/api/reservas', authenticateToken);

app.post('/api/reservas', async (req, res) => {
  try {
    const { responsavel, data_inicio, data_fim, notebooks_ids } = req.body;

    if (!responsavel || !data_inicio || !data_fim || !notebooks_ids?.length) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (!validarData(data_inicio) || !validarData(data_fim) || new Date(data_fim) <= new Date(data_inicio)) {
        return res.status(400).json({ error: 'Datas inválidas.' });
    }
    
    const placeholders = notebooks_ids.map(() => '?').join(',');
    const notebooks = await dbAll(`SELECT id, status FROM notebooks WHERE id IN (${placeholders})`, notebooks_ids);

    if (notebooks.some(n => n.status !== 'disponivel')) {
        return res.status(409).json({ error: 'Um ou mais notebooks selecionados não estão disponíveis.'});
    }

    const conflitos = await dbAll(`
        SELECT r.id FROM reservas r
        JOIN reserva_notebooks rn ON r.id = rn.reserva_id
        WHERE rn.notebook_id IN (${placeholders}) AND NOT (r.data_fim <= ? OR r.data_inicio >= ?)
    `, [...notebooks_ids, data_inicio, data_fim]);

    if (conflitos.length > 0) {
        return res.status(409).json({ error: 'Conflito de horário para um ou mais notebooks.' });
    }

    const reservaId = uuidv4();
    await dbRun("INSERT INTO reservas (id, responsavel, data_inicio, data_fim) VALUES (?, ?, ?, ?)", [reservaId, responsavel, data_inicio, data_fim]);
    
    for (const notebookId of notebooks_ids) {
        await dbRun("INSERT INTO reserva_notebooks (reserva_id, notebook_id) VALUES (?, ?)", [reservaId, notebookId]);
    }
    
    res.status(201).json({ message: 'Reserva criada com sucesso!' });

  } catch (err) {
    console.error('Erro ao criar reserva:', err);
    res.status(500).json({ error: 'Erro interno ao criar reserva' });
  }
});

app.get('/api/reservas', async (req, res) => {
  try {
    const reservas = await dbAll(`
        SELECT r.*, 
               json_group_array(json_object('id', n.id, 'nome', n.nome, 'patrimonio', n.patrimonio)) as notebooks
        FROM reservas r
        LEFT JOIN reserva_notebooks rn ON r.id = rn.reserva_id
        LEFT JOIN notebooks n ON rn.notebook_id = n.id
        GROUP BY r.id
        ORDER BY r.data_inicio DESC
    `);
    
    const reservasFormatadas = reservas.map(r => ({
        ...r,
        notebooks: r.notebooks ? JSON.parse(r.notebooks).filter(n => n.id !== null) : []
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
    if (!reserva) return res.status(404).json({ error: 'Reserva não encontrada' });
    
    await dbRun("DELETE FROM reservas WHERE id = ?", [id]);
    res.status(200).json({ message: 'Reserva cancelada com sucesso' });
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
    if (err) console.error(err.message);
    console.log('\nConexão com o banco de dados fechada.');
    process.exit(0);
  });
});
