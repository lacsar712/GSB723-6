import React from 'react';
import { Button, Result } from 'antd';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <Result
            status="error"
            title="页面出现错误"
            subTitle="请刷新页面或重新登录后再试。"
            extra={[
              <Button key="reload" type="primary" onClick={() => window.location.reload()}>
                刷新
              </Button>
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}

