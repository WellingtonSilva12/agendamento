// routes/notebookRoutes.js
const express = require('express');
const router = express.Router();
const notebookController = require('../controllers/notebookController');
const { authenticateToken, isAdmin } = require('../middleware/authMiddleware');

// Rota pública
router.get('/', notebookController.getAllNotebooks);

// Rotas protegidas para administradores
router.post('/', authenticateToken, isAdmin, notebookController.createNotebook);
router.put('/:id', authenticateToken, isAdmin, notebookController.updateNotebook);
router.delete('/:id', authenticateToken, isAdmin, notebookController.deleteNotebook);

module.exports = router;