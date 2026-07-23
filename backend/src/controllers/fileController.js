const { StandardFile, FileVersion, FileRelation, Interpretation } = require('../models');
const { Op } = require('sequelize');
const logger = require('../utils/logger');
const { Readable } = require('stream');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || '/app/data';

function safeFileName(name) {
  const base = (name || 'file').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim();
  return base.length ? base : 'file';
}

async function resolveVersion(fileId, query) {
  if (query.versionId) {
    const v = await FileVersion.findOne({ where: { id: parseInt(query.versionId), file_id: fileId } });
    if (v) return v;
  }
  if (query.version) {
    const v = await FileVersion.findOne({ where: { version: String(query.version), file_id: fileId } });
    if (v) return v;
  }
  const current = await FileVersion.findOne({
    where: { file_id: fileId, status: '当前版本' },
    order: [['publish_date', 'DESC']]
  });
  if (current) return current;
  return FileVersion.findOne({ where: { file_id: fileId }, order: [['publish_date', 'DESC']] });
}

async function streamRemote(url, res, disposition) {
  const r = await fetch(url);
  if (!r.ok) {
    const msg = `远程文件获取失败: ${r.status} ${r.statusText}`;
    const err = new Error(msg);
    err.status = 502;
    throw err;
  }

  const contentType = r.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  const contentLength = r.headers.get('content-length');
  if (contentLength) res.setHeader('Content-Length', contentLength);

  if (disposition) res.setHeader('Content-Disposition', disposition);

  const body = r.body ? Readable.fromWeb(r.body) : Readable.from([]);
  body.pipe(res);
}

async function streamLocal(storedPath, res, disposition, mimeType) {
  const abs = path.isAbsolute(storedPath) ? storedPath : path.join(DATA_DIR, storedPath);
  if (!fs.existsSync(abs)) {
    const err = new Error('本地文件不存在');
    err.status = 404;
    throw err;
  }
  if (mimeType) res.setHeader('Content-Type', mimeType);
  if (disposition) res.setHeader('Content-Disposition', disposition);
  fs.createReadStream(abs).pipe(res);
}

exports.getStats = async (req, res, next) => {
  try {
    const total = await StandardFile.count();
    const national = await StandardFile.count({ where: { category_level1: '国家标准' } });
    const local = await StandardFile.count({ where: { category_level1: '地方标准' } });
    const industry = await StandardFile.count({ where: { category_level1: '行业标准' } });
    res.json({ total, national, local, industry });
  } catch (err) { next(err); }
};

exports.getTree = async (req, res, next) => {
  try {
    const files = await StandardFile.findAll({
      attributes: ['id', 'code', 'name', 'category_level1', 'category_level2', 'category_level3', 'status', 'file_type'],
      order: [['category_level1', 'ASC'], ['category_level2', 'ASC'], ['name', 'ASC']]
    });
    const tree = {};
    files.forEach(f => {
      const l1 = f.category_level1;
      const l2 = f.category_level2 || '未分类';
      if (!tree[l1]) tree[l1] = {};
      if (!tree[l1][l2]) tree[l1][l2] = [];
      tree[l1][l2].push({ id: f.id, code: f.code, name: f.name, status: f.status, file_type: f.file_type });
    });
    const result = Object.entries(tree).map(([level1, children]) => ({
      name: level1,
      count: Object.values(children).reduce((s, arr) => s + arr.length, 0),
      children: Object.entries(children).map(([level2, items]) => ({
        name: level2,
        count: items.length,
        files: items
      }))
    }));
    res.json(result);
  } catch (err) { next(err); }
};

exports.listFiles = async (req, res, next) => {
  try {
    const { category, status, keyword, page = 1, pageSize = 10 } = req.query;
    const where = {};
    if (category) where.category_level1 = category;
    if (status) where.status = status;
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { code: { [Op.like]: `%${keyword}%` } },
        { keywords: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } }
      ];
    }
    const offset = (parseInt(page) - 1) * parseInt(pageSize);
    const { count, rows } = await StandardFile.findAndCountAll({
      where, offset, limit: parseInt(pageSize),
      order: [['publish_date', 'DESC']]
    });
    res.json({ total: count, page: parseInt(page), pageSize: parseInt(pageSize), data: rows });
  } catch (err) { next(err); }
};

exports.getFile = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id, {
      include: [
        { model: FileVersion, as: 'versions', order: [['publish_date', 'DESC']] },
        { model: FileRelation, as: 'relations', include: [{ model: StandardFile, as: 'targetFile', attributes: ['id', 'code', 'name', 'status'] }] },
        { model: Interpretation, as: 'interpretations', attributes: ['id', 'title', 'type', 'expert_name', 'duration', 'views'] }
      ]
    });
    if (!file) return res.status(404).json({ error: '文件不存在' });
    res.json(file);
  } catch (err) { next(err); }
};

exports.createFile = async (req, res, next) => {
  try {
    const file = await StandardFile.create(req.body);
    await FileVersion.create({
      file_id: file.id, version: file.current_version || 'v1.0',
      change_log: '首次发布', publish_date: file.publish_date, status: '当前版本'
    });
    logger.info('File created', { id: file.id, code: file.code });
    res.status(201).json(file);
  } catch (err) { next(err); }
};

exports.updateFile = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: '文件不存在' });
    await file.update(req.body);
    logger.info('File updated', { id: file.id });
    res.json(file);
  } catch (err) { next(err); }
};

exports.deleteFile = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: '文件不存在' });
    await file.destroy();
    logger.info('File deleted', { id: req.params.id });
    res.json({ message: '删除成功' });
  } catch (err) { next(err); }
};

exports.getVersions = async (req, res, next) => {
  try {
    const versions = await FileVersion.findAll({
      where: { file_id: req.params.id },
      order: [['publish_date', 'DESC']]
    });
    res.json(versions);
  } catch (err) { next(err); }
};

exports.createVersion = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: '文件不存在' });
    await FileVersion.update({ status: '历史版本' }, { where: { file_id: file.id, status: '当前版本' } });
    const version = await FileVersion.create({ ...req.body, file_id: file.id, status: '当前版本' });
    await file.update({ current_version: version.version });
    logger.info('Version created', { file_id: file.id, version: version.version });
    res.status(201).json(version);
  } catch (err) { next(err); }
};

exports.getRelations = async (req, res, next) => {
  try {
    const relations = await FileRelation.findAll({
      where: { source_file_id: req.params.id },
      include: [{ model: StandardFile, as: 'targetFile', attributes: ['id', 'code', 'name', 'status', 'category_level1'] }]
    });
    res.json(relations);
  } catch (err) { next(err); }
};

exports.createRelation = async (req, res, next) => {
  try {
    const relation = await FileRelation.create({ ...req.body, source_file_id: req.params.id });
    logger.info('Relation created', { source: req.params.id, target: req.body.target_file_id });
    res.status(201).json(relation);
  } catch (err) { next(err); }
};

exports.viewFile = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    const version = await resolveVersion(file.id, req.query);
    if (!version) return res.status(404).json({ error: '文件版本不存在' });

    const ext = file.file_type === 'PDF' ? 'pdf' : file.file_type === 'HTML' ? 'html' : 'bin';
    const filename = `${safeFileName(`${file.code}-${file.name}`)}.${ext}`;
    if (version.storage_type === 'upload' && version.stored_path) {
      await streamLocal(version.stored_path, res, `inline; filename="${encodeURIComponent(filename)}"`, version.mime_type);
      return;
    }
    if (!version.source_url) return res.status(404).json({ error: '文件来源不存在' });
    await streamRemote(version.source_url, res, `inline; filename="${encodeURIComponent(filename)}"`);
  } catch (err) {
    next(err);
  }
};

exports.downloadFile = async (req, res, next) => {
  try {
    const file = await StandardFile.findByPk(req.params.id);
    if (!file) return res.status(404).json({ error: '文件不存在' });

    const version = await resolveVersion(file.id, req.query);
    if (!version) return res.status(404).json({ error: '文件版本不存在' });

    const ext = file.file_type === 'PDF' ? 'pdf' : file.file_type === 'HTML' ? 'html' : 'bin';
    const filename = `${safeFileName(`${file.code}-${file.name}`)}.${ext}`;
    if (version.storage_type === 'upload' && version.stored_path) {
      await streamLocal(version.stored_path, res, `attachment; filename="${encodeURIComponent(filename)}"`, version.mime_type);
      return;
    }
    if (!version.source_url) return res.status(404).json({ error: '文件来源不存在' });
    await streamRemote(version.source_url, res, `attachment; filename="${encodeURIComponent(filename)}"`);
  } catch (err) {
    next(err);
  }
};

exports.uploadFile = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const payload = req.body || {};
    const code = (payload.code || '').trim();
    const name = (payload.name || '').trim();
    const category_level1 = payload.category_level1;
    if (!code || !name || !category_level1) return res.status(400).json({ error: '编号、名称、分类不能为空' });

    const publish_date = payload.publish_date || null;
    const file_type = payload.file_type || (req.file.mimetype?.includes('pdf') ? 'PDF' : 'PDF');
    const status = payload.status || '生效中';
    const current_version = payload.version || (await (async () => {
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
      return `upload-${ts}`;
    })());

    let file = await StandardFile.findOne({ where: { code } });
    if (!file) {
      file = await StandardFile.create({
        code,
        name,
        category_level1,
        category_level2: payload.category_level2 || null,
        category_level3: payload.category_level3 || null,
        publisher: payload.publisher || null,
        publish_date,
        status,
        current_version,
        file_type,
        description: payload.description || null,
        content_preview: payload.content_preview || null,
        keywords: payload.keywords || null
      });
    } else {
      await file.update({
        name,
        category_level1,
        category_level2: payload.category_level2 || file.category_level2,
        category_level3: payload.category_level3 || file.category_level3,
        publisher: payload.publisher || file.publisher,
        publish_date: publish_date || file.publish_date,
        status: status || file.status,
        current_version,
        file_type: file_type || file.file_type,
        description: payload.description || file.description,
        keywords: payload.keywords || file.keywords
      });
      await FileVersion.update({ status: '历史版本' }, { where: { file_id: file.id, status: '当前版本' } });
    }

    const storedPath = req.file.path.startsWith(DATA_DIR) ? path.relative(DATA_DIR, req.file.path) : req.file.path;

    const version = await FileVersion.create({
      file_id: file.id,
      version: current_version,
      change_log: payload.change_log || '上传更新',
      publish_date: publish_date || null,
      status: '当前版本',
      storage_type: 'upload',
      stored_path: storedPath,
      file_name: req.file.originalname,
      mime_type: req.file.mimetype,
      file_size: req.file.size
    });

    logger.info('File uploaded', { id: file.id, version: version.version, by: req.user?.username });
    res.status(201).json({ file, version });
  } catch (err) {
    next(err);
  }
};
