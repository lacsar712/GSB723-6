import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Collapse,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  notification
} from 'antd';
import { KeyOutlined, CopyOutlined, ReloadOutlined, DeleteOutlined, SearchOutlined, DownloadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { api } from '../lib/api.js';

const { RangePicker } = DatePicker;

const PAGE_SIZE = 10;
const REVOKE_LIMIT = 50;
const REASON_MIN = 5;
const REASON_MAX = 100;
const EXPORT_MAX_ROWS = 5000;

const STATUS_OPTIONS = [
  { label: '未使用', value: 'unused' },
  { label: '已使用', value: 'used' },
  { label: '已作废', value: 'revoked' },
  { label: '已使用（历史兑换）', value: 'redeemed' }
];

// 展示层：used 与 redeemed 均映射为「已使用」；作废仅 revoked
const STATUS_META = {
  unused: { text: '未使用', color: 'green' },
  used: { text: '已使用', color: 'blue' },
  revoked: { text: '已作废', color: 'red' },
  redeemed: { text: '已使用', color: 'blue' }
};

function renderStatus(status) {
  const meta = STATUS_META[status] || { text: status || '-', color: 'default' };
  return <Tag color={meta.color}>{meta.text}</Tag>;
}

export default function AgentCardKeysPage({ agent, onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [codesModal, setCodesModal] = useState({ open: false, codes: [], appName: '' });

  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [selectedRows, setSelectedRows] = useState([]);

  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [quota, setQuota] = useState({
    card_quota_total: agent?.card_quota_total ?? 0,
    card_quota_used: agent?.card_quota_used ?? 0,
    card_quota_reserved: agent?.card_quota_reserved ?? 0
  });

  // 筛选条件（点击「查询」时才真正提交到 filters）
  const [form] = Form.useForm();
  const [genForm] = Form.useForm();
  const [revokeForm] = Form.useForm();
  const [filters, setFilters] = useState({
    application_id: undefined,
    status: undefined,
    keyword: '',
    revoked_from: undefined,
    revoked_to: undefined
  });

  const appOptions = useMemo(() => (apps || []).map(a => ({ label: a.name, value: a.id })), [apps]);

  const remaining = useMemo(
    () => Math.max(0, (quota.card_quota_total || 0) - (quota.card_quota_used || 0) - (quota.card_quota_reserved || 0)),
    [quota]
  );

  async function loadApps() {
    const appsData = await api.listApps();
    setApps(appsData);
  }

  async function loadQuota() {
    try {
      const me = await api.me();
      setQuota({
        card_quota_total: me.card_quota_total,
        card_quota_used: me.card_quota_used,
        card_quota_reserved: me.card_quota_reserved
      });
    } catch {
      /* 忽略额度刷新失败，不阻塞列表 */
    }
  }

  // 列表与导出共用同一套筛选参数，禁止两套逻辑分叉
  function buildQueryParams(activeFilters) {
    return {
      application_id: activeFilters.application_id,
      status: activeFilters.status,
      keyword: activeFilters.keyword,
      revoked_from: activeFilters.revoked_from,
      revoked_to: activeFilters.revoked_to
    };
  }

  async function loadList(targetPage = page, activeFilters = filters) {
    setLoading(true);
    try {
      const listData = await api.listCardKeys({
        ...buildQueryParams(activeFilters),
        limit: PAGE_SIZE,
        offset: (targetPage - 1) * PAGE_SIZE
      });
      setItems(listData.items || []);
      setTotal(listData.total || 0);
      setPage(targetPage);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAll() {
    await Promise.all([loadApps(), loadQuota(), loadList(page, filters)]);
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadApps(), loadQuota(), loadList(1, filters)]);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearSelection() {
    setSelectedRowKeys([]);
    setSelectedRows([]);
  }

  function handleQuery() {
    const values = form.getFieldsValue();
    const range = values.revoked_range || [];
    const next = {
      application_id: values.application_id,
      status: values.status,
      keyword: (values.keyword || '').trim(),
      revoked_from: range[0] ? range[0].format('YYYY-MM-DD') : undefined,
      revoked_to: range[1] ? range[1].format('YYYY-MM-DD') : undefined
    };
    setFilters(next);
    clearSelection();
    loadList(1, next);
  }

  function handleReset() {
    form.resetFields();
    const next = { application_id: undefined, status: undefined, keyword: '', revoked_from: undefined, revoked_to: undefined };
    setFilters(next);
    clearSelection();
    loadList(1, next);
  }

  async function handleExport() {
    // 前端预拦截：当前筛选结果超过 5000 行时提示缩小筛选（后端亦有 400 兜底）
    if (total > EXPORT_MAX_ROWS) {
      notification.warning({
        message: `导出超过 ${EXPORT_MAX_ROWS} 行，请缩小筛选范围`,
        description: `当前筛选共 ${total} 条`,
        placement: 'topRight'
      });
      return;
    }
    setExporting(true);
    try {
      await api.exportCardKeysCsv(buildQueryParams(filters));
      notification.success({ message: `已导出当前筛选结果（共 ${total} 条）`, placement: 'topRight' });
    } catch {
      /* 错误提示已在 api 层弹出（含后端 >5000 行 400） */
    } finally {
      setExporting(false);
    }
  }

  const columns = [
    { title: '卡密', dataIndex: 'code', key: 'code', render: v => <Typography.Text code copyable>{v}</Typography.Text> },
    { title: '绑定应用', dataIndex: 'application', key: 'application', render: a => a?.name || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: renderStatus },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', render: v => (v ? new Date(v).toLocaleString() : '-') },
    {
      title: '作废时间',
      dataIndex: 'revoked_at',
      key: 'revoked_at',
      render: (v, row) => (row.status === 'revoked' && v ? new Date(v).toLocaleString() : '-')
    },
    {
      title: '作废原因',
      dataIndex: 'revoked_reason',
      key: 'revoked_reason',
      render: (v, row) => (row.status === 'revoked' ? v || '-' : '-')
    },
    {
      title: '操作人',
      dataIndex: 'revoked_by_name',
      key: 'revoked_by_name',
      render: (v, row) => (row.status === 'revoked' ? v || '-' : '-')
    }
  ];

  const rowSelection = {
    selectedRowKeys,
    preserveSelectedRowKeys: true,
    onChange: (keys, rows) => {
      setSelectedRowKeys(keys);
      setSelectedRows(rows);
    },
    getCheckboxProps: record => ({ disabled: record.status !== 'unused' })
  };

  async function copyCodes(codes) {
    const text = (codes || []).join('\n');
    if (!text) {
      notification.warning({ message: '没有可复制的卡密', placement: 'topRight' });
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      notification.success({ message: `已复制 ${codes.length} 条卡密`, placement: 'topRight' });
    } catch {
      notification.error({ message: '复制失败', placement: 'topRight' });
    }
  }

  function openRevoke() {
    if (selectedRowKeys.length === 0) {
      notification.warning({ message: '请先选择未使用的卡密', placement: 'topRight' });
      return;
    }
    if (selectedRowKeys.length > REVOKE_LIMIT) {
      notification.error({ message: `单次最多作废 ${REVOKE_LIMIT} 条`, placement: 'topRight' });
      return;
    }
    revokeForm.resetFields();
    setRevokeOpen(true);
  }

  async function submitRevoke() {
    let values;
    try {
      values = await revokeForm.validateFields();
    } catch {
      return;
    }

    setRevoking(true);
    try {
      const resp = await api.revokeCardKeys({
        ids: selectedRowKeys,
        reason: values.reason.trim()
      });

      if (resp.quota) setQuota(resp.quota);

      // 使用规格字段 success_count / failures（兼容旧字段兜底）
      const successCount = resp.success_count ?? resp.succeeded ?? 0;
      const failures = resp.failures ?? resp.failed ?? [];
      const parts = [`成功作废 ${successCount} 张`];
      if (failures.length > 0) {
        parts.push(`跳过 ${failures.length} 张`);
        // 取失败明细前 3 条摘要
        const brief = failures
          .slice(0, 3)
          .map(f => `#${f.id}${f.code ? `(${f.code})` : ''}：${f.reason || '不可作废'}`)
          .join('；');
        const more = failures.length > 3 ? ` 等（另有 ${failures.length - 3} 条）` : '';
        parts.push(`明细：${brief}${more}`);
      }
      notification.success({ message: '批量作废完成', description: parts.join('，'), placement: 'topRight' });

      setRevokeOpen(false);
      clearSelection();
      await Promise.all([loadList(page, filters), loadQuota(), onRefresh?.()]);
    } finally {
      setRevoking(false);
    }
  }

  const cardStyle = {
    borderRadius: 16,
    boxShadow: '0 12px 30px rgba(0,0,0,0.06)',
    background: 'rgba(255,255,255,0.72)',
    backdropFilter: 'blur(16px)'
  };

  return (
    <Space direction="vertical" size={14} style={{ width: '100%' }}>
      <Card bordered={false} style={{ ...cardStyle, background: 'rgba(255,255,255,0.75)' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} size={12}>
          <Space direction="vertical" size={2}>
            <Space size={8} align="center">
              <Typography.Title level={4} style={{ margin: 0 }}>
                卡密管理
              </Typography.Title>
              <Tag color="geekblue" style={{ marginInlineStart: 4 }}>卡密域规范附录 v1（R5）</Tag>
            </Space>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              生成绑定应用的卡密，并占用当前账号额度；作废未使用卡密可回补额度
            </Typography.Text>
          </Space>
          <Space size={24} wrap>
            <Statistic title="总额度" value={quota.card_quota_total} />
            <Statistic title="已用" value={quota.card_quota_used} />
            <Statistic title="预留" value={quota.card_quota_reserved} />
            <Statistic title="剩余可用" value={remaining} valueStyle={{ color: '#1677ff' }} />
            <Button icon={<ReloadOutlined />} onClick={() => reloadAll()} style={{ borderRadius: 12 }}>
              刷新
            </Button>
          </Space>
        </Space>
      </Card>

      <Collapse
        bordered={false}
        style={{ ...cardStyle, background: 'rgba(255,255,255,0.6)' }}
        items={[
          {
            key: 'rules',
            label: (
              <Space size={8}>
                <InfoCircleOutlined style={{ color: '#1677ff' }} />
                <Typography.Text strong>规则说明</Typography.Text>
              </Space>
            ),
            children: (
              <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                <li>仅「未使用（unused）」状态的卡密可作废；已使用 / 已作废的卡密不可再作废。</li>
                <li>单次批量作废数量上限为 {REVOKE_LIMIT} 张，超过将被拦截。</li>
                <li>作废原因必填，长度为 {REASON_MIN}~{REASON_MAX} 个字符（按去除首尾空格后计算）。</li>
                <li>批量作废支持「部分成功」：可作废的正常处理，不可作废的会跳过并在结果中列出明细。</li>
                <li>额度回补按实际成功作废的条数计算（已用 -= 成功数），不按提交条数回补。</li>
                <li>导出按当前筛选条件生成 CSV，最多 {EXPORT_MAX_ROWS} 行，超过请缩小筛选范围。</li>
              </ul>
            )
          }
        ]}
      />

      <Card bordered={false} style={cardStyle}>
        <Form
          form={genForm}
          layout="inline"
          onFinish={async (values) => {
            setGenerating(true);
            try {
              const resp = await api.generateCardKeys(values);
              setCodesModal({ open: true, codes: resp.codes || [], appName: resp.application?.name || '' });
              genForm.setFieldsValue({ count: 10 });
              await Promise.all([loadList(1, filters), loadQuota(), onRefresh?.()]);
            } finally {
              setGenerating(false);
            }
          }}
          initialValues={{ application_id: undefined, count: 10 }}
        >
          <Form.Item name="application_id" rules={[{ required: true, message: '请选择应用' }]} style={{ minWidth: 260 }}>
            <Select placeholder="选择应用" options={appOptions} />
          </Form.Item>
          <Form.Item name="count" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber min={1} max={500} />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<KeyOutlined />} loading={generating} style={{ borderRadius: 12 }}>
            生成卡密
          </Button>
          <Typography.Text type="secondary" style={{ marginLeft: 12, alignSelf: 'center' }}>
            当前剩余可用额度：<Typography.Text strong>{remaining}</Typography.Text>
          </Typography.Text>
        </Form>
      </Card>

      <Card bordered={false} style={cardStyle}>
        <Form form={form} layout="inline" style={{ rowGap: 12 }}>
          <Form.Item name="application_id" label="绑定应用" style={{ minWidth: 220 }}>
            <Select placeholder="全部应用" options={appOptions} allowClear />
          </Form.Item>
          <Form.Item name="status" label="状态" style={{ minWidth: 160 }}>
            <Select placeholder="全部状态" options={STATUS_OPTIONS} allowClear />
          </Form.Item>
          <Form.Item name="keyword" label="卡密关键字">
            <Input placeholder="模糊搜索卡密" allowClear onPressEnter={handleQuery} style={{ width: 200 }} />
          </Form.Item>
          <Form.Item name="revoked_range" label="作废时间">
            <RangePicker allowClear placeholder={['作废起', '作废止']} />
          </Form.Item>
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={handleQuery} style={{ borderRadius: 12 }}>
              查询
            </Button>
            <Button onClick={handleReset} style={{ borderRadius: 12 }}>
              重置
            </Button>
            <Button
              icon={<DownloadOutlined />}
              loading={exporting}
              onClick={handleExport}
              style={{ borderRadius: 12 }}
            >
              导出当前筛选结果
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12, alignSelf: 'center' }}>
              最多导出 {EXPORT_MAX_ROWS} 行
            </Typography.Text>
          </Space>
        </Form>
      </Card>

      {selectedRowKeys.length > 0 && (
        <Card
          bordered={false}
          style={{ ...cardStyle, background: 'rgba(22,119,255,0.08)' }}
          bodyStyle={{ padding: '12px 16px' }}
        >
          <Space style={{ width: '100%', justifyContent: 'space-between', flexWrap: 'wrap' }} size={12}>
            <Typography.Text>
              已选择 <Typography.Text strong>{selectedRowKeys.length}</Typography.Text> 张卡密
              {selectedRowKeys.length > REVOKE_LIMIT && (
                <Typography.Text type="danger" style={{ marginLeft: 8 }}>
                  （超过单次上限 {REVOKE_LIMIT} 张）
                </Typography.Text>
              )}
            </Typography.Text>
            <Space>
              <Button
                icon={<CopyOutlined />}
                onClick={() => copyCodes(selectedRows.map(r => r.code))}
                style={{ borderRadius: 12 }}
              >
                复制选中
              </Button>
              <Button
                danger
                type="primary"
                icon={<DeleteOutlined />}
                onClick={openRevoke}
                style={{ borderRadius: 12 }}
              >
                批量作废
              </Button>
              <Button onClick={clearSelection} style={{ borderRadius: 12 }}>
                取消选择
              </Button>
            </Space>
          </Space>
        </Card>
      )}

      <Card bordered={false} style={cardStyle}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          rowSelection={rowSelection}
          pagination={{
            current: page,
            pageSize: PAGE_SIZE,
            total,
            showTotal: t => `共 ${t} 条`,
            showSizeChanger: false,
            onChange: p => loadList(p, filters)
          }}
        />
      </Card>

      <Modal
        title="批量作废卡密"
        open={revokeOpen}
        confirmLoading={revoking}
        onOk={submitRevoke}
        onCancel={() => setRevokeOpen(false)}
        okText="确认作废"
        okButtonProps={{ danger: true }}
        cancelText="取消"
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          将作废选中的 <Typography.Text strong>{selectedRowKeys.length}</Typography.Text> 张卡密（仅「未使用」状态可作废，其余将被跳过）。
          作废后额度将按实际成功条数回补。
        </Typography.Paragraph>
        <Form form={revokeForm} layout="vertical">
          <Form.Item
            name="reason"
            label="作废原因"
            rules={[
              { required: true, message: `作废原因至少需要 ${REASON_MIN} 个字符` },
              {
                validator: (_, value) => {
                  const len = (value || '').trim().length;
                  // 按 trim 后长度计算；过短/过长分开提示（附录 C01/C02）
                  if (len < REASON_MIN) {
                    return Promise.reject(new Error(`作废原因至少需要 ${REASON_MIN} 个字符`));
                  }
                  if (len > REASON_MAX) {
                    return Promise.reject(new Error(`作废原因不能超过 ${REASON_MAX} 个字符`));
                  }
                  return Promise.resolve();
                }
              }
            ]}
          >
            <Input.TextArea rows={3} maxLength={REASON_MAX} showCount placeholder="请填写作废原因（5~100 字符）" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`已生成卡密${codesModal.appName ? `（${codesModal.appName}）` : ''}`}
        open={codesModal.open}
        onCancel={() => setCodesModal({ open: false, codes: [], appName: '' })}
        footer={[
          <Button key="copy" icon={<CopyOutlined />} onClick={() => copyCodes(codesModal.codes)}>
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
    </Space>
  );
}
