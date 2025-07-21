
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const { db } = require('./config/database');

const authRoutes = require('./routes/authRoutes');
const notebookRoutes = require('./routes/notebookRoutes');
const reservaRoutes = require('./routes/reservaRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/notebooks', notebookRoutes);
app.use('/api/reservas', reservaRoutes);
app.use('/api', userRoutes); 

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\nServidor rodando em http://localhost:${PORT}`);
});

process.on('SIGINT', () => {
  console.log('\nRecebido SIGINT. Fechando o servidor...');
  server.close(() => {
    console.log('Servidor fechado.');
    db.close((err) => {
      if (err) console.error(err.message);
      console.log('Conexão com o banco de dados fechada.');
      process.exit(0);
    });
  });
});