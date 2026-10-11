import { PublicShell } from '@/components/PublicShell'
export const metadata = { title: '统一账号 · 待完善', robots: { index: false, follow: false } }
export default function Account() {
  return (
    <PublicShell>
      <div className="container account-pending">
        <p className="eyebrow">第二阶段 · 待完善</p>
        <h1>一个账号，连接小小的世界。</h1>
        <p>QQ 登录、WordPress 用户绑定和积分签到将在 P2 接入。当前不提供登录、积分或战绩模拟。</p>
        <a className="button button-outline" href="/">
          返回首页
        </a>
      </div>
    </PublicShell>
  )
}
