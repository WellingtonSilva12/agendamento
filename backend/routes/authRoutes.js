// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// @route   POST api/auth/register
// @desc    Registra um novo usuário
// @access  Public
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Autentica o usuário e retorna o token
// @access  Public
router.post('/login', authController.login);

module.exports = router;