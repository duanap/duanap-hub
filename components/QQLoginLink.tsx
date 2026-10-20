export function QQLoginLink({ compact = false }: { compact?: boolean }) {
  // Keep Tencent's downloaded assets unchanged. A plain anchor avoids starting
  // an authorization request through Next.js link prefetching.
  return <a href="/login/qq" className={compact ? 'qq-login-link qq-login-compact' : 'qq-login-link'} aria-label="QQ登录">
    {compact ? <><img src="/qq/qq-icon.png" width={16} height={16} alt="" /><span>QQ登录</span></>
      : <img src="/qq/qq-login.png" width={170} height={32} alt="QQ登录" />}
  </a>
}
