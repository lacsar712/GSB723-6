import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Card, Collapse, Input, Select, Space, Tag, Typography } from 'antd';
import { LikeOutlined, ReloadOutlined } from '@ant-design/icons';

export default function FaqPage() {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', keyword: '' });
  const [data, setData] = useState({ total: 0, data: [] });

  const options = useMemo(() => {
    return Object.keys(categories).map(k => ({ label: `${k}（${categories[k]}）`, value: k }));
  }, [categories]);

  const load = async () => {
    setLoading(true);
    try {
      const [c, list] = await Promise.all([
        api.getFaqCategories(),
        api.listFaqs({
          category: filters.category || undefined,
          keyword: filters.keyword || undefined,
          page: 1,
          pageSize: 50
        })
      ]);
      setCategories(c);
      setData(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={16}>
      <Card
        bordered={false}
        title="常见问题库"
        extra={
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
            刷新
          </Button>
        }
      >
        <Space wrap>
          <Select
            placeholder="选择分类"
            style={{ width: 220 }}
            allowClear
            value={filters.category || undefined}
            options={options}
            onChange={v => setFilters(s => ({ ...s, category: v || '' }))}
          />
          <Input
            placeholder="输入关键词"
            style={{ width: 260 }}
            allowClear
            value={filters.keyword}
            onChange={e => setFilters(s => ({ ...s, keyword: e.target.value }))}
            onPressEnter={load}
          />
          <Button type="primary" onClick={load} loading={loading}>
            查询
          </Button>
        </Space>
      </Card>

      <Card bordered={false} title={`问题列表（${data.total}）`}>
        <Collapse
          accordion
          items={(data.data || []).map(item => ({
            key: String(item.id),
            label: (
              <Space wrap>
                <Typography.Text strong>{item.question}</Typography.Text>
                <Tag color="gold">{item.category}</Tag>
                <Tag>浏览 {item.view_count}</Tag>
                <Tag>有帮助 {item.helpful_count}</Tag>
              </Space>
            ),
            children: (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {item.answer}
                </Typography.Paragraph>
                <Space wrap>
                  {item.related_standard ? <Tag color="blue">{item.related_standard}</Tag> : null}
                  <Button
                    icon={<LikeOutlined />}
                    onClick={async () => {
                      await api.markFaqHelpful(item.id);
                      await load();
                    }}
                  >
                    有帮助
                  </Button>
                </Space>
              </Space>
            )
          }))}
        />
      </Card>
    </Space>
  );
}
