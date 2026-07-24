import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography, Input, notification
} from 'antd';
import {
  KeyOutlined, CopyOutlined, ReloadOutlined, SearchOutlined,
  StopOutlined, CheckCircleOutlined, CloseCircleOutlined
} from '@ant-design/icons';
import { api } from '../lib/api.js';

const STATUS_OPTIONS = [
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' }
];

function statusTag(status) {
  if (status === 'unused') return <Tag color="blue" icon={<CheckCircleOutlined />}>未使用</Tag>;
  if (status === 'used') return <Tag color="green" icon={<CheckCircleOutlined />}>已使用</Tag>;
  if (status === 'revoked') return <Tag color="red" icon={<CloseCircleOutlined />}>已作废</Tag>;
  return <Tag>{status}</Tag>;
}

export default function AgentCardKeysPage({ agent: initialAgent, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [codesModal, setCodesModal] = useState({ open: false, codes: [], appName: '' });
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [revokeModal, setRevokeModal] = useState({ open: false });
  const [revoking, setRevoking] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [localAgent, setLocalAgent] = useState(initialAgent);
  const [filterForm] = Form.useForm();
  const [revokeForm] = Form.useForm();
  const [genForm] = Form.useForm();

  const agent = localAgent || initialAgent;

  const appOptions = useMemo(() => (apps || []).map(a => ({ label: a.name, value: a.id })), [apps]);

  const remaining = useMemo(() => {
    if (!agent) return 0;
    return Math.max(0, agent.card_quota_total - agent.card_quota_used - agent.card_quota_reserved);
  }, [agent]);

  async function fetchList(pageNum = 1) {
    setLoading(true);
    try {
      const filters = filterForm.getFieldsValue();
      const params = {
        limit: pageSize,
        offset: (pageNum - 1) * pageSize
      };
      if (filters.application_id) params.application_id = filters.application_id;
      if (filters.status) params.status = filters.status;
      if (filters.keyword) params.keyword = filters.keyword.trim();

      const data = await api.listCardKeys(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setPage(pageNum);
      setSelectedRowKeys([]);
    } finally {
      setLoading(false);
    }
  }

  async function reload() {
    try {
      const appsData = await api.listApps();
      setApps(appsData);
    } catch {}
    await fetchList(1);
  }

  useEffect(() => {
    setLocalAgent(initialAgent);
  }, [initialAgent]);

  useEffect(() => {
    reload();
  }, []);

  function handleSearch() {
    fetchList(1);
  }

  function handleReset() {
    filterForm.resetFields();
    fetchList(1);
  }

  async function handleCopySelected() {
    const selected = items.filter(item => selectedRowKeys.includes(item.id));
    const text = selected.map(s => s.code).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notification.success({ message: `已复制 ${selected.length} 条卡密到剪贴板`, placement: 'topRight' });
    } catch {
      notification.error({ message: '复制失败，请手动复制', placement: 'topRight' });
    }
  }

  async function handleRevoke() {
    try {
      const values = await revokeForm.validateFields();
      setRevoking(true);
      try {
        const resp = await api.revokeCardKeysBatch({ ids: selectedRowKeys, reason: values.reason });
        const successCount = resp.success_count || 0;
        const failures = resp.failures || [];

        if (resp.agent) {
          const updatedAgent = { ...agent, ...resp.agent };
          setLocalAgent(updatedAgent);
          onRefresh?.();
        }

        setRevokeModal({ open: false });
        revokeForm.resetFields();
        setSelectedRowKeys([]);

        if (failures.length > 0) {
          notification.warning({
            message: `成功作废 ${successCount} 条，${failures.length} 条失败`,
            description: failures.slice(0, 5).map(f => `${f.code || f.id}: ${f.reason}`).join('；') + (failures.length > 5 ? '...' : ''),
            placement: 'topRight',
            duration: 6
          });
        } else {
          notification.success({ message: `成功作废 ${successCount} 条卡密，额度已回补`, placement: 'topRight' });
        }

        await fetchList(page);
      } finally {
        setRevoking(false);
      }
    } catch {}
  }

  const columns = [
    { title: '卡密', dataIndex: 'code', key: 'code', render: v => <Typography.Text code copyable={false}>{v}</Typography.Text> },
    { title: '绑定应用', dataIndex: 'application', key: 'application', render: a => a?.name || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: s => statusTag(s) },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', width: 180, render: v => (v ? new Date(v).toLocaleString() : '-') }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: setSelectedRowKeys,
    getCheckboxProps: (record) => ({
      disabled: record.status !== 'unused'
    })
  };

  const selectedUnusedCount = useMemo(() => {
    return items.filter(item => selectedRowKeys.includes(item.id) && item.status === 'unused').length;
  }, [selectedRowKeys, items]);

  const cardStyle = {
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(16px)'
  };

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card bordered={false} style={{ borderRadius: 16, boxShadow: '0 12px 30px rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(16px)' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} size={12}>
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} style={{ margin: 0 }}>卡密管理</Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>生成绑定应用的卡密，并占用当前账号额度</Typography.Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => reload()} style={{ borderRadius: 12 }}>刷新</Button>
        </Space>
      </Card>

      {agent && (
        <Card bordered={false} style={cardStyle}>
          <Space size={24} wrap>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>总额度</Typography.Text>
              <div><Typography.Title level={3} style={{ margin: 0, color: '#1677ff' }}>{agent.card_quota_total}</Typography.Title></div>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>已使用</Typography.Text>
              <div><Typography.Title level={3} style={{ margin: 0, color: '#ff4d4f' }}>{agent.card_quota_used}</Typography.Title></div>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>预留(下级)</Typography.Text>
              <div><Typography.Title level={3} style={{ margin: 0, color: '#faad14' }}>{agent.card_quota_reserved}</Typography.Title></div>
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>可用剩余</Typography.Text>
              <div><Typography.Title level={3} style={{ margin: 0, color: '#52c41a' }}>{remaining}</Typography.Title></div>
            </div>
          </Space>
        </Card>
      )}

      <Card bordered={false} style={cardStyle}>
        <Form form={genForm} layout="inline" onFinish={async (values) => {
          setGenerating(true);
          try {
            const resp = await api.generateCardKeys(values);
            setCodesModal({ open: true, codes: resp.codes || [], appName: resp.application?.name || '' });
            await reload();
            onRefresh?.();
            genForm.setFieldsValue({ count: 10 });
          } finally {
            setGenerating(false);
          }
        }} initialValues={{ application_id: undefined, count: 10 }}>
          <Form.Item name="application_id" rules={[{ required: true, message: '请选择应用' }]} style={{ minWidth: 260 }}>
            <Select placeholder="选择应用" options={appOptions} />
          </Form.Item>
          <Form.Item name="count" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={1} max={500} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<KeyOutlined />} loading={generating} style={{ borderRadius: 12 }}>
            生成卡密
          </Button>
        </Form>
      </Card>

      <Card bordered={false} style={cardStyle}>
        <Form form={filterForm} layout="inline" style={{ marginBottom: 16 }} onFinish={handleSearch}>
          <Form.Item name="application_id" style={{ minWidth: 200 }}>
            <Select placeholder="绑定应用" allowClear options={appOptions} />
          </Form.Item>
          <Form.Item name="status" style={{ minWidth: 140 }}>
            <Select placeholder="状态" allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="keyword" style={{ minWidth: 200 }}>
            <Input placeholder="搜索卡密" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
            </Space>
          </Form.Item>
        </Form>

        {selectedRowKeys.length > 0 && (
          <div style={{
            marginBottom: 12,
            padding: '10px 16px',
            borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(22,119,255,0.08) 0%, rgba(114,46,209,0.06) 100%)',
            border: '1px solid rgba(22,119,255,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8
          }}>
            <Space size={12}>
              <Typography.Text strong>已选择 {selectedRowKeys.length} 条</Typography.Text>
              {selectedUnusedCount < selectedRowKeys.length && (
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  （其中 {selectedUnusedCount} 条可作废，{selectedRowKeys.length - selectedUnusedCount} 条非未使用状态将跳过）
                </Typography.Text>
              )}
            </Space>
            <Space>
              <Button icon={<CopyOutlined />} onClick={handleCopySelected}>复制卡密</Button>
              <Button
                type="primary"
                danger
                icon={<StopOutlined />}
                disabled={selectedUnusedCount === 0}
                onClick={() => setRevokeModal({ open: true })}
              >
                批量作废
              </Button>
              <Button onClick={() => setSelectedRowKeys([])}>取消选择</Button>
            </Space>
          </div>
        )}

        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: false,
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p) => fetchList(p)
          }}
        />
      </Card>

      <Modal
        title={`已生成卡密${codesModal.appName ? `（${codesModal.appName}）` : ''}`}
        open={codesModal.open}
        onCancel={() => setCodesModal({ open: false, codes: [], appName: '' })}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={async () => {
            const text = (codesModal.codes || []).join('\n');
            try {
              await navigator.clipboard.writeText(text);
              notification.success({ message: '已复制到剪贴板', placement: 'topRight' });
            } catch {
              notification.error({ message: '复制失败', placement: 'topRight' });
            }
          }}>复制全部</Button>,
          <Button key="close" type="primary" onClick={() => setCodesModal({ open: false, codes: [], appName: '' })}>关闭</Button>
        ]}
      >
        <div style={{ maxHeight: 360, overflow: 'auto', padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.03)' }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {(codesModal.codes || []).map(c => (
              <Typography.Text key={c} code style={{ display: 'block' }}>{c}</Typography.Text>
            ))}
          </Space>
        </div>
      </Modal>

      <Modal
        title="批量作废卡密"
        open={revokeModal.open}
        onCancel={() => { setRevokeModal({ open: false }); revokeForm.resetFields(); }}
        onOk={handleRevoke}
        confirmLoading={revoking}
        okText="确认作废"
        okButtonProps={{ danger: true }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Typography.Text>
            即将作废 <Typography.Text strong>{selectedUnusedCount}</Typography.Text> 条未使用卡密，作废后额度将回补至当前账号。
          </Typography.Text>
          {selectedRowKeys.length - selectedUnusedCount > 0 && (
            <Typography.Text type="warning">
              注意：{selectedRowKeys.length - selectedUnusedCount} 条非未使用状态的卡密将被自动跳过。
            </Typography.Text>
          )}
          <Form form={revokeForm} layout="vertical">
            <Form.Item
              name="reason"
              label="作废原因"
              rules={[
                { required: true, message: '请填写作废原因' },
                {
                  validator: (_, value) => {
                    const trimmed = (value || '').trim();
                    if (trimmed.length < 5) return Promise.reject(new Error('作废原因至少需要 5 个字符'));
                    if (trimmed.length > 100) return Promise.reject(new Error('作废原因不能超过 100 个字符'));
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input.TextArea rows={3} placeholder="请输入作废原因（5-100个字符）" maxLength={120} showCount />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
