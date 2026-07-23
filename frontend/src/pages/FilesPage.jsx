import React, { useEffect, useMemo, useState } from 'react';
import {
  Card,
  Col,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Modal,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Button,
  Select,
  Input,
  Tree,
  Tabs,
  List,
  notification,
  Upload
} from 'antd';
import { api } from '../lib/api.js';
import { LinkOutlined, EyeOutlined, DownloadOutlined, UploadOutlined } from '@ant-design/icons';

function buildTreeNodes(tree) {
  return (tree || []).map(l1 => ({
    key: l1.name,
    title: (
      <Space size={8}>
        <Typography.Text strong>{l1.name}</Typography.Text>
        <Tag color="blue">{l1.count}</Tag>
      </Space>
    ),
    children: (l1.children || []).map(l2 => ({
      key: `${l1.name}/${l2.name}`,
      title: (
        <Space size={8}>
          <Typography.Text>{l2.name}</Typography.Text>
          <Tag>{l2.count}</Tag>
        </Space>
      ),
      children: (l2.files || []).map(f => ({
        key: `file:${f.id}`,
        title: (
          <Space size={8}>
            <Typography.Text>{f.name}</Typography.Text>
            <Tag color="default">{f.code}</Tag>
            <Tag color={f.status === '生效中' ? 'green' : f.status === '已废止' ? 'volcano' : 'default'}>
              {f.status}
            </Tag>
          </Space>
        )
      }))
    }))
  }));
}

export default function FilesPage() {
  const [stats, setStats] = useState({ total: 0, national: 0, local: 0, industry: 0 });
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState({ total: 0, data: [], page: 1, pageSize: 10 });
  const [filters, setFilters] = useState({ category: '', status: '', keyword: '' });
  const [selected, setSelected] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadForm] = Form.useForm();
  const [uploadFile, setUploadFile] = useState(null);
  const [interpOpen, setInterpOpen] = useState(false);
  const [interpLoading, setInterpLoading] = useState(false);
  const [interp, setInterp] = useState(null);

  const nodes = useMemo(() => buildTreeNodes(tree), [tree]);

  const load = async (next = {}) => {
    setLoading(true);
    try {
      const category = next.category !== undefined ? next.category : (filters.category || undefined);
      const status = next.status !== undefined ? next.status : (filters.status || undefined);
      const keyword = next.keyword !== undefined ? next.keyword : (filters.keyword || undefined);
      const [s, t, l] = await Promise.all([
        api.getStats(),
        api.getTree(),
        api.listFiles({
          page: next.page ?? list.page ?? 1,
          pageSize: next.pageSize ?? list.pageSize ?? 10,
          category,
          status,
          keyword
        })
      ]);
      setStats(s);
      setTree(t);
      setList(l);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openDetail = async id => {
    setLoading(true);
    try {
      const f = await api.getFile(id);
      setSelected(f);
      setDetailOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const openInterpretation = async id => {
    setInterpLoading(true);
    try {
      const res = await api.getInterpretation(id);
      setInterp(res);
      setInterpOpen(true);
    } catch (e) {
      notification.error({ message: '打开解读失败', description: e?.message || '请稍后重试', placement: 'topRight' });
    } finally {
      setInterpLoading(false);
    }
  };

  const columns = [
    {
      title: '编号',
      dataIndex: 'code',
      width: 220,
      render: v => <Typography.Text style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{v}</Typography.Text>
    },
    { title: '名称', dataIndex: 'name', ellipsis: true },
    { title: '分类', dataIndex: 'category_level1', width: 110, render: v => <Tag color="blue">{v}</Tag> },
    { title: '发布机构', dataIndex: 'publisher', width: 180, ellipsis: true },
    { title: '发布日期', dataIndex: 'publish_date', width: 120 },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: v => <Tag color={v === '生效中' ? 'green' : v === '已废止' ? 'volcano' : 'default'}>{v}</Tag>
    },
    { title: '类型', dataIndex: 'file_type', width: 90, render: v => <Tag>{v}</Tag> },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, row) => (
        <Space>
          <Button type="link" icon={<EyeOutlined />} onClick={() => openDetail(row.id)}>
            详情
          </Button>
        </Space>
      )
    }
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Row gutter={16}>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="文档总量" value={stats.total} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="国家" value={stats.national} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="地方" value={stats.local} />
          </Card>
        </Col>
        <Col span={6}>
          <Card bordered={false}>
            <Statistic title="行业" value={stats.industry} />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Card
            bordered={false}
            title="分类体系"
            extra={
              <Button size="small" onClick={() => load()}>
                刷新
              </Button>
            }
          >
            <Tree
              showLine
              defaultExpandAll
              treeData={nodes}
              onSelect={keys => {
                const k = keys?.[0];
                if (typeof k === 'string' && k.startsWith('file:')) {
                  openDetail(parseInt(k.slice('file:'.length)));
                }
              }}
            />
          </Card>
        </Col>
        <Col span={16}>
          <Card
            bordered={false}
            title="文件列表"
            extra={
              <Space>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  onClick={() => {
                    if (!localStorage.getItem('token')) {
                      notification.warning({ message: '请先登录后再上传', placement: 'topRight' });
                      return;
                    }
                    setUploadOpen(true);
                  }}
                >
                  上传文件
                </Button>
                <Button
                  onClick={() => {
                    const qs = new URLSearchParams({
                      ...(filters.category ? { category: filters.category } : {}),
                      ...(filters.status ? { status: filters.status } : {}),
                      ...(filters.keyword ? { keyword: filters.keyword } : {})
                    }).toString();
                    window.open(`/api/export/files.csv${qs ? `?${qs}` : ''}`, '_blank', 'noopener,noreferrer');
                  }}
                >
                  导出清单CSV
                </Button>
                <Button
                  type="primary"
                  disabled={!selectedIds.length}
                  onClick={async () => {
                    try {
                      const r = await fetch('/api/export/files.zip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: selectedIds })
                      });
                      if (!r.ok) throw new Error(`导出失败 (${r.status})`);
                      const blob = await r.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = 'standard-files.zip';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch (e) {
                      notification.error({
                        message: '批量导出失败',
                        description: e?.message || '请稍后重试',
                        placement: 'topRight'
                      });
                    }
                  }}
                >
                  批量导出ZIP
                </Button>
                <Select
                  value={filters.category || undefined}
                  style={{ width: 120 }}
                  placeholder="分类"
                  allowClear
                  options={[
                    { label: '国家标准', value: '国家标准' },
                    { label: '地方标准', value: '地方标准' },
                    { label: '行业标准', value: '行业标准' }
                  ]}
                  onChange={v => setFilters(s => ({ ...s, category: v || '' }))}
                />
                <Select
                  value={filters.status || undefined}
                  style={{ width: 110 }}
                  placeholder="状态"
                  allowClear
                  options={[
                    { label: '生效中', value: '生效中' },
                    { label: '已废止', value: '已废止' },
                    { label: '草案', value: '草案' }
                  ]}
                  onChange={v => setFilters(s => ({ ...s, status: v || '' }))}
                />
                <Input
                  value={filters.keyword}
                  style={{ width: 220 }}
                  placeholder="关键词 / 编号 / 标题"
                  allowClear
                  onChange={e => setFilters(s => ({ ...s, keyword: e.target.value }))}
                  onPressEnter={() => load({ page: 1 })}
                />
                <Button type="primary" onClick={() => load({ page: 1 })}>
                  查询
                </Button>
              </Space>
            }
          >
            <Table
              rowKey="id"
              loading={loading}
              columns={columns}
              dataSource={list.data}
              rowSelection={{
                selectedRowKeys: selectedIds,
                onChange: keys => setSelectedIds(keys)
              }}
              pagination={{
                current: list.page,
                pageSize: list.pageSize,
                total: list.total,
                showSizeChanger: true,
                onChange: (page, pageSize) => load({ page, pageSize })
              }}
            />
          </Card>
        </Col>
      </Row>

      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={860}
        destroyOnClose
        title={selected ? selected.name : '文件详情'}
        extra={
          selected ? (
            <Space>
              <Button
                icon={<EyeOutlined />}
                onClick={() => {
                  window.open(`/api/files/${selected.id}/view`, '_blank', 'noopener,noreferrer');
                }}
              >
                打开来源
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => {
                  window.open(`/api/files/${selected.id}/download`, '_blank', 'noopener,noreferrer');
                }}
              >
                下载
              </Button>
            </Space>
          ) : null
        }
      >
        {selected ? (
          <>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="编号">{selected.code}</Descriptions.Item>
              <Descriptions.Item label="类型">{selected.file_type}</Descriptions.Item>
              <Descriptions.Item label="分类">{selected.category_level1}</Descriptions.Item>
              <Descriptions.Item label="发布机构">{selected.publisher || '-'}</Descriptions.Item>
              <Descriptions.Item label="发布日期">{selected.publish_date || '-'}</Descriptions.Item>
              <Descriptions.Item label="状态">{selected.status}</Descriptions.Item>
              <Descriptions.Item label="当前版本">{selected.current_version}</Descriptions.Item>
              <Descriptions.Item label="关键词" span={1}>
                {selected.keywords || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="摘要" span={2}>
                {selected.description || '-'}
              </Descriptions.Item>
            </Descriptions>

            <Divider />

            <Tabs
              items={[
                {
                  key: 'preview',
                  label: '核心章节预览',
                  children: (
                    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                      {selected.content_preview || '暂无预览内容'}
                    </Typography.Paragraph>
                  )
                },
                {
                  key: 'versions',
                  label: '版本管理',
                  children: (
                    <List
                      dataSource={selected.versions || []}
                      renderItem={v => (
                        <List.Item
                          actions={[
                            v.source_url ? (
                              <Button
                                key="open"
                                type="link"
                                icon={<LinkOutlined />}
                                onClick={() => window.open(`/api/files/${selected.id}/view?versionId=${v.id}`, '_blank', 'noopener,noreferrer')}
                              >
                                打开
                              </Button>
                            ) : null
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Space wrap>
                                <Typography.Text strong>{v.version}</Typography.Text>
                                <Tag color={v.status === '当前版本' ? 'green' : 'default'}>{v.status}</Tag>
                                {v.publish_date ? <Tag>{v.publish_date}</Tag> : null}
                                {v.storage_type ? <Tag>{v.storage_type}</Tag> : null}
                              </Space>
                            }
                            description={v.change_log || '-'}
                          />
                        </List.Item>
                      )}
                    />
                  )
                },
                {
                  key: 'relations',
                  label: '关联配置',
                  children: (
                    <List
                      dataSource={selected.relations || []}
                      renderItem={r => (
                        <List.Item
                          actions={[
                            <Button key="detail" type="link" onClick={() => openDetail(r.targetFile.id)}>
                              查看
                            </Button>
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Space wrap>
                                <Tag color="geekblue">{r.relation_type}</Tag>
                                <Typography.Text strong>{r.targetFile.name}</Typography.Text>
                                <Tag>{r.targetFile.code}</Tag>
                                <Tag color={r.targetFile.status === '生效中' ? 'green' : 'default'}>{r.targetFile.status}</Tag>
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )
                },
                {
                  key: 'interpretations',
                  label: '解读推荐',
                  children: (
                    <List
                      dataSource={selected.interpretations || []}
                      renderItem={it => (
                        <List.Item
                          actions={[
                            <Button
                              key="watch"
                              type="primary"
                              loading={interpLoading && interp?.id === it.id}
                              onClick={async () => {
                                if (it.type === 'video' && it.video_url) {
                                  window.open(it.video_url, '_blank', 'noopener,noreferrer');
                                  return;
                                }
                                await openInterpretation(it.id);
                              }}
                            >
                              立即观看
                            </Button>
                          ]}
                        >
                          <List.Item.Meta
                            title={
                              <Space wrap>
                                <Typography.Text strong>{it.title}</Typography.Text>
                                <Tag color={it.type === 'video' ? 'purple' : 'geekblue'}>{it.type === 'video' ? '视频' : '图文'}</Tag>
                                {it.expert_name ? <Tag>{it.expert_name}</Tag> : null}
                              </Space>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )
                }
              ]}
            />
          </>
        ) : null}
      </Drawer>

      <Modal
        open={interpOpen}
        title={interp?.title || '解读'}
        onCancel={() => {
          setInterpOpen(false);
          setInterp(null);
        }}
        footer={
          <Space>
            <Button
              onClick={() => {
                setInterpOpen(false);
                setInterp(null);
              }}
            >
              关闭
            </Button>
            {interp?.type === 'video' && interp?.video_url ? (
              <Button type="primary" onClick={() => window.open(interp.video_url, '_blank', 'noopener,noreferrer')}>
                立即观看
              </Button>
            ) : null}
          </Space>
        }
        width={860}
        destroyOnClose
      >
        {interp ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Space wrap>
              <Tag color={interp.type === 'video' ? 'purple' : 'geekblue'}>{interp.type === 'video' ? '视频' : '图文'}</Tag>
              {interp.file?.code ? <Tag>{interp.file.code}</Tag> : null}
              {interp.expert_name ? <Tag>{interp.expert_name}</Tag> : null}
              {interp.expert_title ? <Tag>{interp.expert_title}</Tag> : null}
              {interp.clause_ref ? <Tag>{interp.clause_ref}</Tag> : null}
            </Space>
            {interp.type === 'article' ? (
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{interp.content || ''}</Typography.Paragraph>
            ) : (
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{interp.content || ''}</Typography.Paragraph>
            )}
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={uploadOpen}
        title="上传标准文件"
        okText="上传"
        cancelText="取消"
        confirmLoading={uploading}
        onCancel={() => {
          setUploadOpen(false);
          uploadForm.resetFields();
          setUploadFile(null);
        }}
        onOk={() => uploadForm.submit()}
        destroyOnClose
      >
        <Form
          form={uploadForm}
          layout="vertical"
          onFinish={async values => {
            if (!uploadFile) {
              notification.warning({ message: '请选择要上传的文件', placement: 'topRight' });
              return;
            }

            const token = localStorage.getItem('token');
            if (!token) {
              notification.warning({ message: '请先登录后再上传', placement: 'topRight' });
              return;
            }

            setUploading(true);
            try {
              const fd = new FormData();
              fd.append('file', uploadFile);
              Object.entries(values).forEach(([k, v]) => {
                if (v == null || v === '') return;
                if (k === 'publish_date') {
                  fd.append(k, v.format('YYYY-MM-DD'));
                  return;
                }
                fd.append(k, v);
              });

              const r = await fetch('/api/files/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: fd
              });
              if (!r.ok) {
                let msg = `上传失败 (${r.status})`;
                try {
                  const j = await r.json();
                  if (j?.error) msg = j.error;
                } catch {}
                throw new Error(msg);
              }

              notification.success({ message: '上传成功', placement: 'topRight' });
              setUploadOpen(false);
              uploadForm.resetFields();
              setUploadFile(null);
              await load({ page: 1 });
            } catch (e) {
              notification.error({ message: '上传失败', description: e?.message || '请稍后重试', placement: 'topRight' });
            } finally {
              setUploading(false);
            }
          }}
        >
          <Upload.Dragger
            multiple={false}
            maxCount={1}
            beforeUpload={file => {
              setUploadFile(file);
              return false;
            }}
            onRemove={() => setUploadFile(null)}
            fileList={uploadFile ? [uploadFile] : []}
          >
            <Space direction="vertical" size={6}>
              <Typography.Text strong>拖拽文件到此处，或点击选择</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                支持 PDF / HTML / 其他格式（建议PDF）
              </Typography.Text>
            </Space>
          </Upload.Dragger>

          <Divider />

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="code" label="文件编号" rules={[{ required: true, message: '请输入文件编号' }]}>
                <Input placeholder="例如：工信厅信发〔2020〕6号" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="name" label="文件名称" rules={[{ required: true, message: '请输入文件名称' }]}>
                <Input placeholder="例如：工业数据分类分级指南（试行）" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="category_level1" label="一级分类" rules={[{ required: true, message: '请选择分类' }]}>
                <Select
                  options={[
                    { label: '国家标准', value: '国家标准' },
                    { label: '地方标准', value: '地方标准' },
                    { label: '行业标准', value: '行业标准' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="publisher" label="发布机构">
                <Input placeholder="例如：工业和信息化部办公厅" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="status" label="生效状态" initialValue="生效中">
                <Select
                  options={[
                    { label: '生效中', value: '生效中' },
                    { label: '已废止', value: '已废止' },
                    { label: '草案', value: '草案' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="file_type" label="文件类型" initialValue="PDF">
                <Select options={[{ label: 'PDF', value: 'PDF' }, { label: 'HTML', value: 'HTML' }]} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="version" label="版本号">
                <Input placeholder="例如：v1.0 / 2024-01" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="change_log" label="更新说明">
                <Input placeholder="例如：新增附件 / 修订条款" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="keywords" label="关键词">
            <Input placeholder="使用逗号分隔，例如：分类分级,数据安全" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
