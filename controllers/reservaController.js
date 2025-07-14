// controllers/reservaController.js
const { v4: uuidv4 } = require('uuid');
const { dbAll, dbGet, dbRun } = require('../config/database');
const { logToHistory } = require('../utils/historyLogger');

function validarData(data) {
  return data && !isNaN(new Date(data));
}

exports.createReserva = async (req, res) => {
  try {
    const { responsavel, data_inicio, data_fim, notebooks_ids } = req.body;

    if (!responsavel || !data_inicio || !data_fim || !notebooks_ids?.length) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }
    if (!validarData(data_inicio) || !validarData(data_fim) || new Date(data_fim) <= new Date(data_inicio)) {
      return res.status(400).json({ error: 'Datas inválidas.' });
    }

    const placeholders = notebooks_ids.map(() => '?').join(',');

    const notebooks = await dbAll(`SELECT * FROM notebooks WHERE id IN (${placeholders})`, notebooks_ids);
    if (notebooks.some(n => n.status !== 'disponivel')) {
      return res.status(409).json({ error: 'Um ou mais notebooks selecionados não estão disponíveis.' });
    }

    const conflitos = await dbAll(`
      SELECT r.id FROM reservas r JOIN reserva_notebooks rn ON r.id = rn.reserva_id
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

    const logData = { reservaId, responsavel, data_inicio, data_fim, notebooks: notebooks };
    await logToHistory('RESERVA_CRIADA', logData);

    res.status(201).json({ message: 'Reserva criada com sucesso!' });
  } catch (err) {
    console.error('Erro ao criar reserva:', err);
    res.status(500).json({ error: 'Erro interno ao criar reserva' });
  }
};

exports.getAllReservas = async (req, res) => {
  try {
    const query = `
      SELECT r.*, json_group_array(json_object('id', n.id, 'nome', n.nome, 'patrimonio', n.patrimonio)) as notebooks
      FROM reservas r 
      LEFT JOIN reserva_notebooks rn ON r.id = rn.reserva_id 
      LEFT JOIN notebooks n ON rn.notebook_id = n.id
      GROUP BY r.id 
      ORDER BY r.data_inicio DESC
    `;
    const reservas = await dbAll(query);
    
    // O SQLite retorna o `notebooks` como uma string JSON, então precisamos parseá-la.
    const reservasFormatadas = reservas.map(r => ({
      ...r,
      notebooks: r.notebooks ? JSON.parse(r.notebooks).filter(n => n.id !== null) : []
    }));
    
    res.json(reservasFormatadas);
  } catch (err) {
    console.error('Erro ao buscar reservas:', err);
    res.status(500).json({ error: 'Erro interno ao buscar reservas' });
  }
};

exports.deleteReserva = async (req, res) => {
  try {
    const { id } = req.params;
    const reserva = await dbGet("SELECT * FROM reservas WHERE id = ?", [id]);
    if (!reserva) {
      return res.status(404).json({ error: 'Reserva não encontrada' });
    }

    const notebooks = await dbAll("SELECT n.* FROM notebooks n JOIN reserva_notebooks rn ON n.id = rn.notebook_id WHERE rn.reserva_id = ?", [id]);
    
    await logToHistory('RESERVA_CANCELADA', { 
      ...reserva, 
      notebooks: notebooks, 
      canceledBy: req.user.username 
    });

    await dbRun("DELETE FROM reservas WHERE id = ?", [id]);
    
    res.status(200).json({ message: 'Reserva cancelada com sucesso' });
  } catch (err) {
    console.error('Erro ao cancelar reserva:', err);
    res.status(500).json({ error: 'Erro interno ao cancelar reserva' });
  }
};