// routes/userRoutes.js
const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');

// Todas as rotas abaixo são apenas para administradores

// @route   GET api/users
// @desc    Obtém a lista de todos os usuários
// @access  Admin
router.get('/users', authenticateToken, isAdmin, userController.getAllUsers);

// @route   GET api/historico
// @desc    Obtém o histórico de reservas
// @access  Admin
router.get('/historico', authenticateToken, isAdmin, userController.getHistory);

module.exports = router;