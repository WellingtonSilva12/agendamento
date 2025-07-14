// controllers/notebookController.js
const { dbAll, dbGet, dbRun } = require('../config/database');
const STATUS_VALIDOS = ['disponivel', 'em_manutencao', 'inativo'];

exports.getAllNotebooks = async (req, res) => {
  try {
    const notebooks = await dbAll("SELECT * FROM notebooks");
    res.json(notebooks);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar notebooks' });
  }
};

exports.createNotebook = async (req, res) => {
  try {
    const { nome, patrimonio, status = 'disponivel' } = req.body;
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    
    if (patrimonio && patrimonio.trim()) {
      const existente = await dbGet("SELECT id FROM notebooks WHERE patrimonio = ?", [patrimonio.trim()]);
      if (existente) return res.status(409).json({ error: 'Este patrimônio já está cadastrado.' });
    }

    const result = await dbRun("INSERT INTO notebooks (nome, patrimonio, status) VALUES (?, ?, ?)", [nome, patrimonio || null, status]);
    const novoNotebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [result.lastID]);
    res.status(201).json(novoNotebook);
  } catch (err) {
    console.error('Erro ao criar notebook:', err);
    res.status(500).json({ error: 'Erro interno ao criar notebook' });
  }
};

exports.updateNotebook = async (req, res) => {
  try {
    const { id } = req.params;
    const { nome, patrimonio, status } = req.body;
    const notebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    
    if (!notebook) return res.status(404).json({ error: 'Notebook não encontrado.' });
    if (!nome) return res.status(400).json({ error: 'Nome é obrigatório.' });
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido.' });

    const finalPatrimonio = (patrimonio && patrimonio.trim()) ? patrimonio.trim() : null;

    if (finalPatrimonio && finalPatrimonio !== notebook.patrimonio) {
      const existente = await dbGet("SELECT id FROM notebooks WHERE patrimonio = ? AND id != ?", [finalPatrimonio, id]);
      if (existente) return res.status(409).json({ error: 'Este patrimônio já está cadastrado em outro notebook.' });
    }

    const inativado_em = (notebook.status === 'inativo' && status !== 'inativo') ? null : notebook.inativado_em;

    await dbRun(
      "UPDATE notebooks SET nome = ?, patrimonio = ?, status = ?, atualizado_em = datetime('now'), inativado_em = ? WHERE id = ?", 
      [nome, finalPatrimonio, status, inativado_em, id]
    );

    const notebookAtualizado = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    res.json(notebookAtualizado);
  } catch (err) {
      console.error('Erro ao atualizar notebook:', err);
      if (err.code === 'SQLITE_CONSTRAINT') {
          return res.status(409).json({ error: 'Conflito de dados. O patrimônio pode já estar em uso.' });
      }
      res.status(500).json({ error: 'Erro interno ao atualizar notebook' });
  }
};

exports.deleteNotebook = async (req, res) => {
  try {
    const { id } = req.params;
    const notebook = await dbGet("SELECT * FROM notebooks WHERE id = ?", [id]);
    if (!notebook) return res.status(404).json({ error: 'Notebook não encontrado.' });
    
    const reservasAtivas = await dbGet("SELECT COUNT(*) as count FROM reserva_notebooks rn JOIN reservas r ON rn.reserva_id = r.id WHERE rn.notebook_id = ? AND r.data_fim > datetime('now')", [id]);
    if (reservasAtivas.count > 0) {
      return res.status(409).json({ error: 'Este notebook possui reservas ativas e não pode ser inativado.' });
    }
    
    await dbRun("UPDATE notebooks SET status = 'inativo', inativado_em = datetime('now') WHERE id = ?", [id]);
    res.status(200).json({ message: 'Notebook marcado como inativo.' });
  } catch (err) {
      console.error('Erro ao inativar notebook:', err);
      res.status(500).json({ error: 'Erro interno ao inativar notebook' });
  }
};