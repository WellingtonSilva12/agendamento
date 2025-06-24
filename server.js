const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

// Configuração do banco de dados SQLite
const DB_FILE = path.join(__dirname, 'agendamentos.db');
const db = new sqlite3.Database(DB_FILE);

// Inicialização do banco de dados
db.serialize(() => {
  // Tabela de notebooks (antigos recursos)
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

  // Tabela de reservas
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

  // Tabela de relacionamento entre reservas e notebooks
  db.run(`
    CREATE TABLE IF NOT EXISTS reserva_notebooks (
      reserva_id TEXT NOT NULL,
      notebook_id INTEGER NOT NULL,
      FOREIGN KEY(reserva_id) REFERENCES reservas(id),
      FOREIGN KEY(notebook_id) REFERENCES notebooks(id),
      PRIMARY KEY(reserva_id, notebook_id)
    )
  `);

  // Inserir notebook inicial se a tabela estiver vazia
  db.get("SELECT COUNT(*) as count FROM notebooks", (err, row) => {
    if (row.count === 0) {
      db.run(
        "INSERT INTO notebooks (nome, status) VALUES (?, ?)",
        ['Notebook 01', 'disponivel']
      );
    }
  });
});

// Promisify para facilitar o uso com async/await
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

// Funções de validação
function temConflitoHorario(reservaA, reservaB) {
  return (
    new Date(reservaA.data_inicio) < new Date(reservaB.data_fim) &&
    new Date(reservaA.data_fim) > new Date(reservaB.data_inicio)
  );
}

function validarData(data) {
  return !isNaN(new Date(data));
}

// Constantes
const STATUS_VALIDOS = ['disponivel', 'em_manutencao', 'inativo'];

// Rotas de Notebooks
app.get('/api/notebooks', async (req, res) => {
  try {
    const notebooks = await dbAll("SELECT * FROM notebooks");
    res.json(notebooks);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notebooks' });
  }
});

app.get('/api/notebooks/disponiveis', async (req, res) => {
  try {
    const { data_inicio, data_fim } = req.query;
    
    const query = "SELECT * FROM notebooks WHERE status = 'disponivel'";
    const notebooksDisponiveis = await dbAll(query);

    if (data_inicio && data_fim) {
      if (!validarData(data_inicio) || !validarData(data_fim)) {
        return res.status(400).json({ error: 'Formato de data inválido' });
      }

      // Verificar conflitos de horário
      const notebooksComConflitos = await dbAll(`
        SELECT DISTINCT rn.notebook_id 
        FROM reserva_notebooks rn
        JOIN reservas r ON rn.reserva_id = r.id
        WHERE r.data_inicio < ? AND r.data_fim > ?
      `, [data_fim, data_inicio]);

      const idsComConflitos = notebooksComConflitos.map(n => n.notebook_id);
      
      const notebooksFiltrados = notebooksDisponiveis.filter(
        notebook => !idsComConflitos.includes(notebook.id)
      );

      return res.json(notebooksFiltrados);
    }

    res.json(notebooksDisponiveis);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notebooks disponíveis' });
  }
});

app.post('/api/notebooks', async (req, res) => {
  try {
    const { nome, patrimonio, status = 'disponivel' } = req.body;

    if (!nome) {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }

    if (!STATUS_VALIDOS.includes(status)) {
      return res.status(400).json({
        error: 'Status inválido. Os status válidos são: disponivel, em_manutencao.'
      });
    }

    if (patrimonio) {
      const existente = await dbGet(
        "SELECT id FROM notebooks WHERE patrimonio = ?",
        [patrimonio]
      );
      if (existente) {
        return res.status(400).json({
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

app.put('/api/notebooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, patrimonio, status } = req.body;
    const notebookId = parseInt(id);

    if (isNaN(notebookId)) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const notebook = await dbGet(
      "SELECT * FROM notebooks WHERE id = ?",
      [notebookId]
    );

    if (!notebook) {
      return res.status(404).json({ error: 'Notebook não encontrado' });
    }

    const novosDados = {
      nome: nome !== undefined ? nome.trim() : notebook.nome,
      patrimonio: patrimonio !== undefined ? patrimonio : notebook.patrimonio,
      status: status || notebook.status
    };

    if (novosDados.nome === '') {
      return res.status(400).json({ error: 'Nome não pode ser vazio' });
    }

    if (!STATUS_VALIDOS.includes(novosDados.status)) {
      return res.status(400).json({
        error: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}`
      });
    }

    if (novosDados.patrimonio !== notebook.patrimonio) {
      const existente = await dbGet(
        "SELECT id FROM notebooks WHERE patrimonio = ? AND id != ?",
        [novosDados.patrimonio, notebookId]
      );
      if (existente) {
        return res.status(400).json({
          error: 'Já existe outro notebook com este patrimônio'
        });
      }
    }

    if (novosDados.status === 'em_manutencao' && notebook.status === 'disponivel') {
      const reservasFuturas = await dbAll(`
        SELECT r.* 
        FROM reservas r
        JOIN reserva_notebooks rn ON r.id = rn.reserva_id
        WHERE rn.notebook_id = ? AND r.data_fim > datetime('now')
      `, [notebookId]);

      if (reservasFuturas.length > 0) {
        return res.status(400).json({
          error: 'Notebook tem reservas futuras. Cancele-as antes de colocar em manutenção',
          reservas: reservasFuturas
        });
      }
    }

    await dbRun(
      `UPDATE notebooks 
       SET nome = ?, patrimonio = ?, status = ?, 
           atualizado_em = datetime('now'),
           inativado_em = CASE WHEN status = 'inativo' AND ? != 'inativo' THEN NULL ELSE inativado_em END
       WHERE id = ?`,
      [
        novosDados.nome,
        novosDados.patrimonio,
        novosDados.status,
        novosDados.status,
        notebookId
      ]
    );

    const notebookAtualizado = await dbGet(
      "SELECT * FROM notebooks WHERE id = ?",
      [notebookId]
    );

    res.json(notebookAtualizado);
  } catch (err) {
    console.error('Erro ao atualizar notebook:', err);
    res.status(500).json({
      error: 'Erro interno ao atualizar notebook',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.delete('/api/notebooks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const notebookId = parseInt(id);

    if (isNaN(notebookId)) {
      return res.status(400).json({ error: 'ID do notebook inválido' });
    }

    const notebook = await dbGet(
      "SELECT * FROM notebooks WHERE id = ?",
      [notebookId]
    );

    if (!notebook) {
      return res.status(404).json({ error: 'Notebook não encontrado' });
    }

    const reservasFuturas = await dbAll(`
      SELECT r.* 
      FROM reservas r
      JOIN reserva_notebooks rn ON r.id = rn.reserva_id
      WHERE rn.notebook_id = ? AND r.data_fim > datetime('now')
    `, [notebookId]);

    if (reservasFuturas.length > 0) {
      return res.status(400).json({
        error: 'Notebook possui reservas futuras. Cancele-as primeiro.',
        reservas: reservasFuturas.map(r => ({
          id: r.id,
          responsavel: r.responsavel,
          periodo: `${r.data_inicio} até ${r.data_fim}`
        }))
      });
    }

    await dbRun(
      "UPDATE notebooks SET status = 'inativo', inativado_em = datetime('now') WHERE id = ?",
      [notebookId]
    );

    await dbRun(
      "DELETE FROM reserva_notebooks WHERE notebook_id = ?",
      [notebookId]
    );

    res.json({
      message: 'Notebook marcado como inativo',
      notebook: {
        id: notebook.id,
        nome: notebook.nome,
        status: 'inativo',
        inativado_em: new Date().toISOString()
      }
    });

  } catch (err) {
    console.error('Erro ao inativar notebook:', err);
    res.status(500).json({
      error: 'Erro interno ao inativar notebook',
      detalhes: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.get('/api/notebooks/inativos', async (req, res) => {
  try {
    const notebooksInativos = await dbAll(
      "SELECT * FROM notebooks WHERE status = 'inativo'"
    );
    res.json(notebooksInativos);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notebooks inativos' });
  }
});

app.get('/api/notebooks/relatorio', async (req, res) => {
  try {
    const stats = {
      total: (await dbGet("SELECT COUNT(*) as count FROM notebooks WHERE status != 'inativo'")).count,
      disponiveis: (await dbGet("SELECT COUNT(*) as count FROM notebooks WHERE status = 'disponivel'")).count,
      em_manutencao: (await dbGet("SELECT COUNT(*) as count FROM notebooks WHERE status = 'em_manutencao'")).count,
      inativos: (await dbGet("SELECT COUNT(*) as count FROM notebooks WHERE status = 'inativo'")).count
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// Rotas de Reservas
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
      return res.status(400).json({ error: 'data_fim deve ser após data_inicio.' });
    }

    // Verificar se todos os notebooks existem
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

    // Verificar se todos os notebooks estão disponíveis
    const notebooksIndisponiveis = notebooks
      .filter(n => n.status !== 'disponivel')
      .map(n => n.id);

    if (notebooksIndisponiveis.length > 0) {
      return res.status(400).json({
        error: `Notebooks indisponíveis: ${notebooksIndisponiveis.join(', ')}`
      });
    }

    // Verificar conflitos de horário
    const conflitos = await dbAll(`
      SELECT r.* 
      FROM reservas r
      JOIN reserva_notebooks rn ON r.id = rn.reserva_id
      WHERE rn.notebook_id IN (${placeholders})
      AND r.data_inicio < ? AND r.data_fim > ?
    `, [...notebooks_ids, data_fim, data_inicio]);

    if (conflitos.length > 0) {
      return res.status(409).json({
        error: 'Conflito de horário com reserva(s) existente(s).',
        conflitos
      });
    }

    // Criar a reserva
    const reservaId = uuidv4();
    await dbRun(
      "INSERT INTO reservas (id, responsavel, data_inicio, data_fim) VALUES (?, ?, ?, ?)",
      [reservaId, responsavel, data_inicio, data_fim]
    );

    // Adicionar os notebooks à reserva
    for (const notebookId of notebooks_ids) {
      await dbRun(
        "INSERT INTO reserva_notebooks (reserva_id, notebook_id) VALUES (?, ?)",
        [reservaId, notebookId]
      );
    }

    const novaReserva = await dbGet(
      "SELECT * FROM reservas WHERE id = ?",
      [reservaId]
    );

    novaReserva.notebooks_ids = notebooks_ids;

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
      SELECT r.*, GROUP_CONCAT(rn.notebook_id) as notebooks_ids
      FROM reservas r
      LEFT JOIN reserva_notebooks rn ON r.id = rn.reserva_id
    `;
    const params = [];
    let whereAdded = false;

    if (notebook_id) {
      query += ` WHERE rn.notebook_id = ?`;
      params.push(notebook_id);
      whereAdded = true;
    }

    if (responsavel) {
      query += whereAdded ? " AND " : " WHERE ";
      query += "r.responsavel LIKE ?";
      params.push(`%${responsavel}%`);
    }

    query += " GROUP BY r.id";

    const reservas = await dbAll(query, params);
    
    // Formatar os IDs dos notebooks como array de números
    const reservasFormatadas = reservas.map(reserva => ({
      ...reserva,
      notebooks_ids: reserva.notebooks_ids 
        ? reserva.notebooks_ids.split(',').map(Number) 
        : []
    }));

    res.json(reservasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar reservas:', err);
    res.status(500).json({ error: 'Erro ao buscar reservas' });
  }
});

app.put('/api/reservas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { responsavel, data_inicio, data_fim, notebooks_ids } = req.body;

    if (!responsavel || !data_inicio || !data_fim || !notebooks_ids?.length) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (!validarData(data_inicio) || !validarData(data_fim)) {
      return res.status(400).json({ error: 'Formato de data inválido' });
    }

    if (new Date(data_fim) <= new Date(data_inicio)) {
      return res.status(400).json({ error: 'data_fim deve ser após data_inicio.' });
    }

    // Verificar se a reserva existe
    const reserva = await dbGet(
      "SELECT * FROM reservas WHERE id = ?",
      [id]
    );

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada' });
    }

    // Verificar se todos os notebooks existem e estão disponíveis
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

    // Verificar disponibilidade (apenas para notebooks que não estavam na reserva original)
    const notebooksOriginais = await dbAll(
      "SELECT notebook_id FROM reserva_notebooks WHERE reserva_id = ?",
      [id]
    );
    const idsOriginais = notebooksOriginais.map(n => n.notebook_id);

    const notebooksIndisponiveis = notebooks
      .filter(n => n.status !== 'disponivel' && !idsOriginais.includes(n.id))
      .map(n => n.id);

    if (notebooksIndisponiveis.length > 0) {
      return res.status(400).json({
        error: `Notebooks indisponíveis: ${notebooksIndisponiveis.join(', ')}`
      });
    }

    // Verificar conflitos de horário (excluindo a própria reserva)
    const conflitos = await dbAll(`
      SELECT r.* 
      FROM reservas r
      JOIN reserva_notebooks rn ON r.id = rn.reserva_id
      WHERE rn.notebook_id IN (${placeholders})
      AND r.id != ?
      AND r.data_inicio < ? AND r.data_fim > ?
    `, [...notebooks_ids, id, data_fim, data_inicio]);

    if (conflitos.length > 0) {
      return res.status(409).json({
        error: 'Conflito de horário com reserva(s) existente(s).',
        conflitos
      });
    }

    // Atualizar a reserva
    await dbRun(
      `UPDATE reservas 
       SET responsavel = ?, data_inicio = ?, data_fim = ?, atualizado_em = datetime('now')
       WHERE id = ?`,
      [responsavel, data_inicio, data_fim, id]
    );

    // Atualizar os notebooks da reserva
    await dbRun(
      "DELETE FROM reserva_notebooks WHERE reserva_id = ?",
      [id]
    );

    for (const notebookId of notebooks_ids) {
      await dbRun(
        "INSERT INTO reserva_notebooks (reserva_id, notebook_id) VALUES (?, ?)",
        [id, notebookId]
      );
    }

    const reservaAtualizada = await dbGet(
      "SELECT * FROM reservas WHERE id = ?",
      [id]
    );

    reservaAtualizada.notebooks_ids = notebooks_ids;

    res.json(reservaAtualizada);
  } catch (err) {
    console.error('Erro ao atualizar reserva:', err);
    res.status(500).json({ error: 'Erro interno ao atualizar reserva' });
  }
});

app.delete('/api/reservas/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se a reserva existe
    const reserva = await dbGet(
      "SELECT * FROM reservas WHERE id = ?",
      [id]
    );

    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada' });
    }

    // Remover os notebooks associados
    await dbRun(
      "DELETE FROM reserva_notebooks WHERE reserva_id = ?",
      [id]
    );

    // Remover a reserva
    await dbRun(
      "DELETE FROM reservas WHERE id = ?",
      [id]
    );

    res.json({ message: 'Reserva cancelada com sucesso' });
  } catch (err) {
    console.error('Erro ao cancelar reserva:', err);
    res.status(500).json({ error: 'Erro ao cancelar reserva' });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

// Tratamento de erros global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erro interno no servidor' });
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log('GET /api/notebooks - Lista todos os notebooks');
  console.log('POST /api/notebooks - Cria um novo notebook');
  console.log('GET /api/notebooks/disponiveis - Lista notebooks disponíveis');
  console.log('POST /api/reservas - Cria uma nova reserva');
  console.log('GET /api/reservas - Lista todas as reservas');
});

// Fechar conexão com o banco de dados ao encerrar o servidor
process.on('SIGINT', () => {
  db.close();
  process.exit();
});