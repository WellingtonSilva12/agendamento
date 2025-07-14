const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'agendamentos.db'); 

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Erro ao abrir o banco de dados", err.message);
  } else {
    console.log("Conectado ao banco de dados SQLite.");
    initializeDb();
  }
});

function initializeDb() {
  db.serialize(() => {
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
}

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

module.exports = { db, dbAll, dbRun, dbGet };