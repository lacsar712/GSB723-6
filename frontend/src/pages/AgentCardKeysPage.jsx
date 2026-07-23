import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Form, InputNumber, Modal, Select, Space, Table, Typography, notification } from 'antd';
import { KeyOutlined, CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { api } from '../lib/api.js';

export default function AgentCardKeysPage({ onRefresh }) {
  const [loading, setLoading] = useState(true);
  const [apps, setApps] = useState([]);
  const [items, setItems] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [codesModal, setCodesModal] = useState({ open: false, codes: [], appName: '' });
  const [form] = Form.useForm();

  const appOptions = useMemo(() => (apps || []).map(a => ({ label: a.name, value: a.id })), [apps]);

  async function reload() {
    setLoading(true);
    try {
      const [appsData, listData] = await Promise.all([api.listApps(), api.listCardKeys({ limit: 50, offset: 0 })]);
      setApps(appsData);
      setItems(listData.items || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  const columns = [
    { title: '卡密', dataIndex: 'code', key: 'code', render: v => <Typography.Text code>{v}</Typography.Text> },
    { title: '绑定应用', dataIndex: 'application', key: 'application', render: a => a?.name || '-' },
    { title: '状态', dataIndex: 'status', key: 'status', width: 110 },
    { title: '生成时间', dataIndex: 'createdAt', key: 'createdAt', render: v => (v ? new Date(v).toLocaleString() : '-') }
  ];

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
              生成绑定应用的卡密，并占用当前账号额度
            </Typography.Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => reload()} style={{ borderRadius: 12 }}>
            刷新
          </Button>
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
          form={form}
          layout="inline"
          onFinish={async (values) => {
            setGenerating(true);
            try {
              const resp = await api.generateCardKeys(values);
              setCodesModal({ open: true, codes: resp.codes || [], appName: resp.application?.name || '' });
              await Promise.all([reload(), onRefresh?.()]);
              form.setFieldsValue({ count: 10 });
            } finally {
              setGenerating(false);
            }
          }}
          initialValues={{ application_id: undefined, count: 10 }}
        >
          <Form.Item
            name="application_id"
            rules={[{ required: true, message: '请选择应用' }]}
            style={{ minWidth: 260 }}
          >
            <Select placeholder="选择应用" options={appOptions} />
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
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={items}
          pagination={{ pageSize: 10 }}
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
    </Space>
  );
}

