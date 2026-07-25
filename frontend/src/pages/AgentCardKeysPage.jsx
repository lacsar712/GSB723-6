import React, { useEffect, useMemo, useState } from 'react';
import {
  Button, Card, Collapse, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography, Input, DatePicker, Alert, notification
} from 'antd';
import {
  KeyOutlined, CopyOutlined, ReloadOutlined, SearchOutlined,
  StopOutlined, CheckCircleOutlined, CloseCircleOutlined, ExportOutlined
} from '@ant-design/icons';
import { api } from '../lib/api.js';

const { RangePicker } = DatePicker;

const STATUS_OPTIONS = [
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' }
];

function statusTag(status) {
  if (status === 'unused') return <Tag color="blue" icon={<CheckCircleOutlined />}>未使用</Tag>;
  if (status === 'used' || status === 'redeemed') return <Tag color="green" icon={<CheckCircleOutlined />}>已使用</Tag>;
  if (status === 'revoked') return <Tag color="red" icon={<CloseCircleOutlined />}>已作废</Tag>;
  return <Tag>{status}</Tag>;
}

function formatDate(v) {
  if (!v) return '-';
  try { return new Date(v).toLocaleString(); } catch { return '-'; }
}

export default function AgentCardKeysPage({ agent: initialAgent, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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

  function getFilterParams() {
    const filters = filterForm.getFieldsValue();
    const params = {};
    if (filters.application_id) params.application_id = filters.application_id;
    if (filters.status) params.status = filters.status;
    if (filters.keyword) params.keyword = filters.keyword.trim();
    if (filters.revoked_range && filters.revoked_range.length === 2) {
      const [start, end] = filters.revoked_range;
      if (start) params.revoked_start = start.format('YYYY-MM-DD');
      if (end) params.revoked_end = end.format('YYYY-MM-DD');
    }
    return params;
  }

  async function fetchList(pageNum = 1) {
    setLoading(true);
    try {
      const params = {
        ...getFilterParams(),
        limit: pageSize,
        offset: (pageNum - 1) * pageSize
      };

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

  async function handleExport() {
    setExporting(true);
    try {
      const params = getFilterParams();
      const res = await api.exportCardKeys(params);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `card-keys-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      notification.success({ message: '导出成功', placement: 'topRight' });
    } catch {
      notification.error({ message: '导出失败', placement: 'topRight' });
    } finally {
      setExporting(false);
    }
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
    if (selectedRowKeys.length > 50) {
      notification.error({ message: '单次批量作废不能超过 50 条', placement: 'topRight' });
      return;
    }
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
          const summary = failures.slice(0, 3).map(f => `· ${f.code || f.id}：${f.reason}`).join('\n');
          notification.warning({
            message: `作废完成：成功 ${successCount} 条，失败 ${failures.length} 条`,
            description: summary + (failures.length > 3 ? `\n· ...共 ${failures.length} 条失败` : ''),
            placement: 'topRight',
            duration: 7
          });
        } else {
          notification.success({ message: `作废成功：共 ${successCount} 条，额度已回补`, placement: 'topRight' });
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
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: s => statusTag(s) },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: formatDate },
    { title: '作废时间', dataIndex: 'revoked_at', key: 'revoked_at', width: 170, render: formatDate },
    { title: '作废原因', dataIndex: 'revoke_reason', key: 'revoke_reason', width: 180, ellipsis: true, render: v => v || '-' },
    { title: '操作人', dataIndex: 'agent', key: 'agent', width: 100, render: a => a?.name || '-' }
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => {
      if (keys.length > 50) {
        notification.warning({ message: '最多只能选择 50 条进行批量操作', placement: 'topRight' });
        return;
      }
      setSelectedRowKeys(keys);
    },
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
            <Space size={8} wrap>
              <Typography.Title level={4} style={{ margin: 0 }}>卡密管理</Typography.Title>
              <Tag color="geekblue" style={{ margin: 0, fontSize: 11, borderRadius: 6 }}>卡密域规范附录 v1（R5）</Tag>
            </Space>
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
        <Collapse
          size="small"
          style={{ marginBottom: 16, background: 'rgba(22,119,255,0.02)', border: '1px solid rgba(22,119,255,0.12)' }}
          items={[{
            key: 'rules',
            label: <Typography.Text strong>📋 规则说明</Typography.Text>,
            children: (
              <Alert
                type="info"
                showIcon={false}
                style={{ background: 'transparent', border: 'none', padding: 0 }}
                description={
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.8 }}>
                    <li><strong>作废条件：</strong>仅状态为「未使用」的卡密允许作废；已使用/已作废的卡密无法再次作废。</li>
                    <li><strong>批量上限：</strong>单次批量作废最多选择 <strong>50 条</strong>卡密，超过请分批操作。</li>
                    <li><strong>作废原因：</strong>必填，去除首尾空格后长度需在 <strong>5～100 个字符</strong>之间。</li>
                    <li><strong>部分成功：</strong>若勾选的卡密中混有不可作废的（如已使用/已作废），可作废的照常处理，不可作废的返回失败明细，不影响其他卡密。</li>
                    <li><strong>额度回补：</strong>作废成功后，账号「已使用额度」按<strong>实际成功作废的条数</strong>扣减（非按勾选条数），可用剩余额度同步回补。</li>
                    <li><strong>数据导出：</strong>导出 CSV 与上方筛选条件联动，最多导出 <strong>5000 条</strong>，超出请缩小筛选范围。</li>
                  </ul>
                }
              />
            )
          }]}
        />

        <Form form={filterForm} layout="inline" style={{ marginBottom: 16, rowGap: 12 }} onFinish={handleSearch}>
          <Form.Item name="application_id" style={{ minWidth: 180 }}>
            <Select placeholder="绑定应用" allowClear options={appOptions} />
          </Form.Item>
          <Form.Item name="status" style={{ minWidth: 130 }}>
            <Select placeholder="状态" allowClear options={STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item name="keyword" style={{ minWidth: 180 }}>
            <Input placeholder="搜索卡密" allowClear onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item name="revoked_range" style={{ minWidth: 260 }}>
            <RangePicker placeholder={['作废起始日期', '作废结束日期']} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} htmlType="submit">查询</Button>
              <Button onClick={handleReset}>重置</Button>
              <Button
                icon={<ExportOutlined />}
                loading={exporting}
                onClick={handleExport}
                disabled={total > 5000}
              >
                导出 CSV
              </Button>
            </Space>
          </Form.Item>
          {total > 5000 && (
            <Typography.Text type="danger" style={{ fontSize: 12, marginLeft: 8 }}>
              当前筛选共 {total} 条，超过导出上限 5000 条，请缩小筛选范围
            </Typography.Text>
          )}
          {total > 0 && total <= 5000 && (
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              将导出 {total} 条记录
            </Typography.Text>
          )}
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
          scroll={{ x: 1100 }}
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
