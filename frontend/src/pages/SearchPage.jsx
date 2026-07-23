import React, { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Card, DatePicker, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';

export default function SearchPage() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ total: 0, data: [], page: 1, pageSize: 10 });

  const columns = useMemo(
    () => [
      { title: '编号', dataIndex: 'code', width: 220, render: v => <Typography.Text style={{ fontFamily: 'ui-monospace, Menlo, monospace' }}>{v}</Typography.Text> },
      { title: '名称', dataIndex: 'name', ellipsis: true },
      { title: '分类', dataIndex: 'category_level1', width: 110, render: v => <Tag color="blue">{v}</Tag> },
      { title: '机构', dataIndex: 'publisher', width: 180, ellipsis: true },
      { title: '发布日期', dataIndex: 'publish_date', width: 120 },
      { title: '状态', dataIndex: 'status', width: 100, render: v => <Tag color={v === '生效中' ? 'green' : v === '已废止' ? 'volcano' : 'default'}>{v}</Tag> }
    ],
    []
  );

  const run = async (page = 1, pageSize = data.pageSize) => {
    const v = form.getFieldsValue();
    const payload = {
      keyword: v.keyword || undefined,
      publisher: v.publisher || undefined,
      file_type: v.file_type || undefined,
      category: v.category || undefined,
      status: v.status || undefined,
      date_from: v.date_range?.[0]?.format('YYYY-MM-DD') || undefined,
      date_to: v.date_range?.[1]?.format('YYYY-MM-DD') || undefined,
      page,
      pageSize
    };

    setLoading(true);
    try {
      const res = await api.search(payload);
      setData(res);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card bordered={false} title="多维度检索" extra={<Button type="primary" onClick={() => run(1)}>检索</Button>}>
        <Form form={form} layout="vertical" initialValues={{ category: undefined, status: undefined, file_type: undefined }}>
          <Space wrap size={16} align="start">
            <Form.Item label="关键词" name="keyword" style={{ width: 260 }}>
              <Input placeholder="例如：分类分级 / 数据安全 / 行动计划" allowClear />
            </Form.Item>
            <Form.Item label="发布机构" name="publisher" style={{ width: 220 }}>
              <Input placeholder="例如：工信部 / 中国信通院" allowClear />
            </Form.Item>
            <Form.Item label="发布日期范围" name="date_range" style={{ width: 280 }}>
              <DatePicker.RangePicker style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="分类" name="category" style={{ width: 140 }}>
              <Select
                allowClear
                options={[
                  { label: '国家标准', value: '国家标准' },
                  { label: '地方标准', value: '地方标准' },
                  { label: '行业标准', value: '行业标准' }
                ]}
              />
            </Form.Item>
            <Form.Item label="状态" name="status" style={{ width: 120 }}>
              <Select
                allowClear
                options={[
                  { label: '生效中', value: '生效中' },
                  { label: '已废止', value: '已废止' },
                  { label: '草案', value: '草案' }
                ]}
              />
            </Form.Item>
            <Form.Item label="文件类型" name="file_type" style={{ width: 120 }}>
              <Select allowClear options={[{ label: 'PDF', value: 'PDF' }, { label: 'HTML', value: 'HTML' }]} />
            </Form.Item>
          </Space>
        </Form>
      </Card>

      <Card bordered={false} title={`检索结果（${data.total}）`}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={data.data}
          pagination={{
            current: data.page,
            pageSize: data.pageSize,
            total: data.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => run(page, pageSize)
          }}
          onRow={row => ({
            onDoubleClick: () => window.open(`/api/files/${row.id}/view`, '_blank', 'noopener,noreferrer')
          })}
        />
      </Card>
    </Space>
  );
}
