import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  notification,
  Alert,
  Statistic,
  Row,
  Col
} from 'antd';
import {
  KeyOutlined,
  CopyOutlined,
  ReloadOutlined,
  SearchOutlined,
  ClearOutlined,
  StopOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined
} from '@ant-design/icons';
import { api } from '../lib/api.js';

const STATUS_OPTIONS = [
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' }
];

const STATUS_META = {
  unused: { color: 'blue', text: '未使用', icon: <ClockCircleOutlined /> },
  used: { color: 'green', text: '已使用', icon: <CheckCircleOutlined /> },
  redeemed: { color: 'green', text: '已使用', icon: <CheckCircleOutlined /> },
  revoked: { color: 'default', text: '已作废', icon: <DeleteOutlined /> }
};

const PAGE_SIZE = 10;
const REVOKE_MAX = 50;

function renderStatus(status) {
  const meta = STATUS_META[status] || { color: 'default', text: status || '-' };
  return (
    <Tag color={meta.color} icon={meta.icon} style={{ borderRadius: 8 }}>
      {meta.text}
    </Tag>
  );
}

export default function AgentCardKeysPage({ agent, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [generating, setGenerating] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [codesModal, setCodesModal] = useState({ open: false, codes: [], appName: '' });
  const [revokeModal, setRevokeModal] = useState({ open: false });
  const [revoking, setRevoking] = useState(false);
  const [filters, setFilters] = useState({ application_id: undefined, status: undefined, keyword: '' });
  const [filterForm] = Form.useForm();
  const [generateForm] = Form.useForm();
  const [revokeForm] = Form.useForm();

  const remaining = useMemo(() => {
    if (!agent) return 0;
    return (agent.card_quota_total || 0) - (agent.card_quota_used || 0) - (agent.card_quota_reserved || 0);
  }, [agent]);

  const fetchApps = useCallback(async () => {
    try {
      const data = await api.listApps();
      setApps(data || []);
    } catch {
      // ignore - already notified by api wrapper
    }
  }, []);

  const fetchList = useCallback(async (override = {}) => {
    const params = {
      application_id: filters.application_id,
      status: filters.status,
      keyword: filters.keyword,
      page: override.page ?? page,
      pageSize: override.pageSize ?? pageSize
    };
    setLoading(true);
    try {
      const data = await api.listCardKeys(params);
      setItems(data.items || []);
      setTotal(data.total || 0);
      if (data.page) setPage(data.page);
      if (data.pageSize) setPageSize(data.pageSize);
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  const reload = useCallback(async () => {
    setSelectedRowKeys([]);
    await Promise.all([fetchApps(), fetchList()]);
  }, [fetchApps, fetchList]);

  useEffect(() => {
    fetchApps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchList({ page: 1, pageSize });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const columns = [
    { title: '卡密', dataIndex: 'code', key: 'code', render: v => <Typography.Text code>{v}</Typography.Text> },
    { title: '绑定应用', dataIndex: 'application', key: 'application', render: a => a?.name || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110, render: v => renderStatus(v) },
    { title: '作废原因', dataIndex: 'revoked_reason', key: 'revoked_reason', ellipsis: true, render: v => v || '-' },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', width: 170, render: v => (v ? new Date(v).toLocaleString() : '-') }
  ];

  function handleSearch() {
    const values = filterForm.getFieldsValue();
    setFilters({
      application_id: values.application_id,
      status: values.status,
      keyword: values.keyword ? String(values.keyword).trim() : ''
    });
    setPage(1);
    setSelectedRowKeys([]);
  }

  function handleReset() {
    filterForm.resetFields();
    setFilters({ application_id: undefined, status: undefined, keyword: '' });
    setPage(1);
    setSelectedRowKeys([]);
  }

  const rowSelection = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getCheckboxProps: (record) => ({
      disabled: record.status !== 'unused'
    })
  };

  const selectedRows = useMemo(
    () => items.filter(it => selectedRowKeys.includes(it.id)),
    [items, selectedRowKeys]
  );

  const revocableSelectedCount = useMemo(
    () => selectedRows.filter(r => r.status === 'unused').length,
    [selectedRows]
  );

  async function handleCopySelected() {
    if (selectedRows.length === 0) {
      notification.warning({ message: '请先勾选要复制的卡密', placement: 'topRight' });
      return;
    }
    const text = selectedRows.map(r => r.code).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notification.success({ message: `已复制 ${selectedRows.length} 条卡密`, placement: 'topRight' });
    } catch {
      notification.error({ message: '复制失败，请检查浏览器权限', placement: 'topRight' });
    }
  }

  function openRevokeModal() {
    if (selectedRowKeys.length === 0) {
      notification.warning({ message: '请先勾选要作废的卡密', placement: 'topRight' });
      return;
    }
    if (selectedRowKeys.length > REVOKE_MAX) {
      notification.error({ message: `单次批量作废不能超过 ${REVOKE_MAX} 条`, placement: 'topRight' });
      return;
    }
    if (revocableSelectedCount === 0) {
      notification.warning({ message: '所选卡密均不可作废（仅未使用状态可作废）', placement: 'topRight' });
      return;
    }
    revokeForm.resetFields();
    setRevokeModal({ open: true });
  }

  async function handleConfirmRevoke() {
    try {
      const values = await revokeForm.validateFields();
      const reason = String(values.reason || '').trim();
      if (reason.length < 5 || reason.length > 100) {
        notification.error({ message: '作废原因长度需在 5-100 个字符之间', placement: 'topRight' });
        return;
      }
      setRevoking(true);
      const ids = selectedRows.filter(r => r.status === 'unused').map(r => r.id);
      const resp = await api.revokeCardKeys({ ids, reason });
      setRevokeModal({ open: false });
      setSelectedRowKeys([]);

      const successCount = resp?.success_count || 0;
      const failCount = resp?.failed_count || 0;
      if (successCount > 0) {
        notification.success({
          message: `作废成功 ${successCount} 条`,
          description: `额度已回补 ${successCount} 条，当前剩余可用 ${resp?.quota?.remaining ?? remaining}`,
          placement: 'topRight',
          duration: 4
        });
      }
      if (failCount > 0) {
        const failDetail = (resp.failures || []).slice(0, 3).map(f => `${f.code || '#' + f.id}：${f.reason}`).join('；');
        notification.warning({
          message: `${failCount} 条卡密未作废`,
          description: failDetail + (resp.failures.length > 3 ? ' ...' : ''),
          placement: 'topRight',
          duration: 5
        });
      }
      await Promise.all([fetchList(), onRefresh?.()]);
    } catch (err) {
      if (err?.errorFields) return;
    } finally {
      setRevoking(false);
    }
  }

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.75)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} size={12}>
          <Space direction="vertical" size={2}>
            <Typography.Title level={4} style={{ margin: 0 }}>
              卡密管理
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              生成绑定应用的卡密，并占用当前账号额度；支持筛选、批量作废与一键复制
            </Typography.Text>
          </Space>
          <Row gutter={16}>
            <Col>
              <Statistic title="总额度" value={agent?.card_quota_total || 0} valueStyle={{ fontSize: 18 }} />
            </Col>
            <Col>
              <Statistic title="已用" value={agent?.card_quota_used || 0} valueStyle={{ fontSize: 18, color: '#cf1322' }} />
            </Col>
            <Col>
              <Statistic title="预留" value={agent?.card_quota_reserved || 0} valueStyle={{ fontSize: 18, color: '#faad14' }} />
            </Col>
            <Col>
              <Statistic
                title="剩余可用"
                value={remaining}
                valueStyle={{ fontSize: 20, color: '#3f8600' }}
              />
            </Col>
          </Row>
        </Space>
      </Card>

      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Form
          form={generateForm}
          layout="inline"
          onFinish={async (values) => {
            setGenerating(true);
            try {
              const resp = await api.generateCardKeys(values);
              setCodesModal({ open: true, codes: resp.codes || [], appName: resp.application?.name || '' });
              await Promise.all([reload(), onRefresh?.()]);
              generateForm.setFieldsValue({ count: 10 });
            } finally {
              setGenerating(false);
            }
          }}
          initialValues={{ application_id: undefined, count: 10 }}
          style={{ rowGap: 12 }}
        >
          <Form.Item
            name="application_id"
            rules={[{ required: true, message: '请选择应用' }]}
            style={{ minWidth: 260 }}
          >
            <Select placeholder="选择应用" options={apps.map(a => ({ label: a.name, value: a.id }))} />
          </Form.Item>

          <Form.Item name="count" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={1} max={500} />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            icon={<KeyOutlined />}
            loading={generating}
            style={{ borderRadius: 12 }}
          >
            生成卡密
          </Button>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            单次最多 500 条，生成后立即占用额度
          </Typography.Text>
        </Form>
      </Card>

      <Card
        bordered={false}
        style={{
          borderRadius: 16,
          boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(16px)'
        }}
      >
        <Form form={filterForm} layout="inline" style={{ rowGap: 12, marginBottom: 12 }}>
          <Form.Item name="application_id" label="应用">
            <Select
              placeholder="全部应用"
              allowClear
              style={{ minWidth: 200 }}
              options={apps.map(a => ({ label: a.name, value: a.id }))}
            />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              placeholder="全部状态"
              allowClear
              style={{ minWidth: 140 }}
              options={STATUS_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="keyword" label="关键字">
            <Input placeholder="输入卡密片段" allowClear style={{ width: 220 }} onPressEnter={handleSearch} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                查询
              </Button>
              <Button icon={<ClearOutlined />} onClick={handleReset}>
                重置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => fetchList()}>
                刷新
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {selectedRowKeys.length > 0 && (
          <Alert
            style={{ marginBottom: 12, borderRadius: 12 }}
            type="info"
            showIcon
            message={
              <Space wrap>
                <span>已选 <b>{selectedRowKeys.length}</b> 条</span>
                {revocableSelectedCount < selectedRowKeys.length && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    （其中 {revocableSelectedCount} 条可作废）
                  </Typography.Text>
                )}
                <Button size="small" icon={<StopOutlined />} danger type="primary" onClick={openRevokeModal}>
                  批量作废
                </Button>
                <Button size="small" icon={<CopyOutlined />} onClick={handleCopySelected}>
                  复制卡密
                </Button>
                <Button size="small" type="text" onClick={() => setSelectedRowKeys([])}>
                  取消选择
                </Button>
              </Space>
            }
          />
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
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (t) => `共 ${t} 条`,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
              setSelectedRowKeys([]);
              fetchList({ page: p, pageSize: ps });
            }
          }}
        />
      </Card>

      <Modal
        title={`已生成卡密${codesModal.appName ? `（${codesModal.appName}）` : ''}`}
        open={codesModal.open}
        onCancel={() => setCodesModal({ open: false, codes: [], appName: '' })}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={async () => {
              const text = (codesModal.codes || []).join('\n');
              try {
                await navigator.clipboard.writeText(text);
                notification.success({ message: '已复制到剪贴板', placement: 'topRight' });
              } catch {
                notification.error({ message: '复制失败', placement: 'topRight' });
              }
            }}
          >
            复制全部
          </Button>,
          <Button key="close" type="primary" onClick={() => setCodesModal({ open: false, codes: [], appName: '' })}>
            关闭
          </Button>
        ]}
      >
        <div style={{ maxHeight: 360, overflow: 'auto', padding: 12, borderRadius: 12, background: 'rgba(0,0,0,0.03)' }}>
          <Space direction="vertical" size={6} style={{ width: '100%' }}>
            {(codesModal.codes || []).map(c => (
              <Typography.Text key={c} code style={{ display: 'block' }}>
                {c}
              </Typography.Text>
            ))}
          </Space>
        </div>
      </Modal>

      <Modal
        title="批量作废卡密"
        open={revokeModal.open}
        onCancel={() => (revoking ? null : setRevokeModal({ open: false }))}
        confirmLoading={revoking}
        onOk={handleConfirmRevoke}
        okText="确认作废"
        okButtonProps={{ danger: true }}
        maskClosable={false}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert
            type="warning"
            showIcon
            message={`将对选中的 ${revocableSelectedCount} 条未使用卡密执行作废`}
            description={
              selectedRowKeys.length > revocableSelectedCount
                ? `另有 ${selectedRowKeys.length - revocableSelectedCount} 条非未使用状态将被自动跳过。作废后状态变更为「已作废」，不可恢复，并回补对应额度。`
                : '作废后状态变更为「已作废」，不可恢复，并回补对应额度。'
            }
          />
          <Form form={revokeForm} layout="vertical">
            <Form.Item
              name="reason"
              label="作废原因"
              rules={[
                { required: true, message: '请填写作废原因' },
                {
                  validator: (_, v) => {
                    const len = String(v || '').trim().length;
                    if (len < 5) return Promise.reject(new Error('至少 5 个字符'));
                    if (len > 100) return Promise.reject(new Error('不能超过 100 个字符'));
                    return Promise.resolve();
                  }
                }
              ]}
            >
              <Input.TextArea
                rows={3}
                maxLength={120}
                showCount
                placeholder="请填写作废原因（5-100 个字符），如：客户取消订单 / 误生成 / 渠道失效"
              />
            </Form.Item>
          </Form>
        </Space>
      </Modal>
    </Space>
  );
}
