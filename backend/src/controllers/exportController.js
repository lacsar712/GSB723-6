const archiver = require('archiver');
const { Readable } = require('stream');
const { Op } = require('sequelize');
const { StandardFile, FileVersion } = require('../models');
const logger = require('../utils/logger');

function escapeCsv(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function getCurrentVersion(fileId) {
  const current = await FileVersion.findOne({
    where: { file_id: fileId, status: '当前版本' },
    order: [['publish_date', 'DESC']]
  });
  if (current) return current;
  return FileVersion.findOne({ where: { file_id: fileId }, order: [['publish_date', 'DESC']] });
}

function buildWhere(query) {
  const { category, status, keyword, publisher, file_type } = query;
  const where = {};
  if (category) where.category_level1 = category;
  if (status) where.status = status;
  if (publisher) where.publisher = { [Op.like]: `%${publisher}%` };
  if (file_type) where.file_type = file_type;
  if (keyword) {
    where[Op.or] = [
      { name: { [Op.like]: `%${keyword}%` } },
      { code: { [Op.like]: `%${keyword}%` } },
      { keywords: { [Op.like]: `%${keyword}%` } },
      { description: { [Op.like]: `%${keyword}%` } }
    ];
  }
  return where;
}

exports.exportFilesCsv = async (req, res, next) => {
  try {
    const files = await StandardFile.findAll({
      where: buildWhere(req.query),
      order: [['publish_date', 'DESC']]
    });

    const rows = [];
    rows.push(['编号', '名称', '分类', '发布机构', '发布日期', '状态', '类型', '来源链接'].map(escapeCsv).join(','));
    for (const f of files) {
      const v = await getCurrentVersion(f.id);
      rows.push(
        [
          f.code,
          f.name,
          f.category_level1,
          f.publisher || '',
          f.publish_date || '',
          f.status,
          f.file_type,
          v?.source_url || ''
        ].map(escapeCsv).join(',')
      );
    }

    const csv = '\uFEFF' + rows.join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="standard-files.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
};

function safeName(input, fallback) {
  const base = (input || fallback || 'file').replace(/[\\/:*?"<>|\n\r\t]/g, ' ').trim();
  return base.length ? base : 'file';
}

async function fetchAsNodeStream(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`下载失败: ${r.status} ${r.statusText}`);
  const contentType = r.headers.get('content-type') || '';
  const contentLength = parseInt(r.headers.get('content-length') || '0') || undefined;
  const body = r.body ? Readable.fromWeb(r.body) : Readable.from([]);
  return { body, contentType, contentLength };
}

exports.exportFilesZip = async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(x => parseInt(x)).filter(Boolean) : [];
    const where = ids.length ? { id: { [Op.in]: ids } } : buildWhere(req.body?.filters || {});

    const files = await StandardFile.findAll({ where, order: [['publish_date', 'DESC']] });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="standard-files.zip"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', err => logger.warn('Zip warning', { message: err.message }));
    archive.on('error', err => {
      throw err;
    });
    archive.pipe(res);

    const manifest = [];
    const errors = [];

    for (const f of files) {
      const v = await getCurrentVersion(f.id);
      const url = v?.source_url;
      const entryBase = safeName(`${f.code}-${f.name}`, `file-${f.id}`);

      manifest.push({
        id: f.id,
        code: f.code,
        name: f.name,
        category: f.category_level1,
        publisher: f.publisher,
        publish_date: f.publish_date,
        status: f.status,
        file_type: f.file_type,
        source_url: url || ''
      });

      if (!url) {
        errors.push(`${entryBase}: 缺少来源链接`);
        continue;
      }

      try {
        const { body, contentType } = await fetchAsNodeStream(url);
        const ext = f.file_type === 'PDF' ? 'pdf' : f.file_type === 'HTML' ? 'html' : 'bin';
        const fileName = `${entryBase}.${ext}`;
        archive.append(body, { name: fileName });
        if (contentType && v && !v.mime_type) {
          await v.update({ mime_type: contentType });
        }
      } catch (e) {
        errors.push(`${entryBase}: ${e.message}`);
      }
    }

    archive.append(JSON.stringify({ generated_at: new Date().toISOString(), count: files.length, items: manifest }, null, 2), {
      name: 'manifest.json'
    });
    if (errors.length) archive.append(errors.join('\n'), { name: 'errors.txt' });

    await archive.finalize();
  } catch (err) {
    next(err);
  }
};

