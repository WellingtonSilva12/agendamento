// routes/reservaRoutes.js
const express = require('express');
const router = express.Router();
const reservaController = require('../controllers/reservaController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Todas as rotas abaixo requerem autenticação

// @route   POST api/reservas
// @desc    Cria uma nova reserva
// @access  Private (usuário logado)
router.post('/', authenticateToken, reservaController.createReserva);

// @route   GET api/reservas
// @desc    Obtém todas as reservas
// @access  Private (usuário logado)
router.get('/', authenticateToken, reservaController.getAllReservas);

// @route   DELETE api/reservas/:id
// @desc    Cancela uma reserva
// @access  Private (usuário logado - a lógica do frontend/controller pode refinar para admin/dono)
router.delete('/:id', authenticateToken, reservaController.deleteReserva);

module.exports = router;