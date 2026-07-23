const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const ctrl = require('../controllers/fileController');
const validate = require('../middleware/validate');
const auth = require('../middleware/auth');

const DATA_DIR = process.env.DATA_DIR || '/app/data';
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

function safeFileName(name) {
  const base = String(name || 'file').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim();
  return base.length ? base : 'file';
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '');
      const base = safeFileName(path.basename(file.originalname || 'upload', ext));
      cb(null, `${Date.now()}-${base}${ext}`);
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/stats', ctrl.getStats);
router.get('/tree', ctrl.getTree);
router.post('/upload', auth, upload.single('file'), ctrl.uploadFile);

router.get('/', ctrl.listFiles);

router.get('/:id/view', ctrl.viewFile);
router.get('/:id/download', ctrl.downloadFile);
router.get('/:id', ctrl.getFile);

router.post('/', auth, [
  body('code').notEmpty().withMessage('文件编号不能为空'),
  body('name').notEmpty().withMessage('文件名称不能为空'),
  body('category_level1').isIn(['国家标准', '地方标准', '行业标准']).withMessage('分类无效'),
  validate
], ctrl.createFile);

router.put('/:id', auth, ctrl.updateFile);
router.delete('/:id', auth, ctrl.deleteFile);

router.get('/:id/versions', ctrl.getVersions);
router.post('/:id/versions', auth, [
  body('version').notEmpty().withMessage('版本号不能为空'),
  validate
], ctrl.createVersion);

router.get('/:id/relations', ctrl.getRelations);
router.post('/:id/relations', auth, [
  body('target_file_id').isInt().withMessage('目标文件ID无效'),
  body('relation_type').isIn(['实施细则', '政策解读', '标准补充', '关联标准']).withMessage('关联类型无效'),
  validate
], ctrl.createRelation);

module.exports = router;
