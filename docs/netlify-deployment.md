# Netlify 배포

Netlify는 공식 Next.js 문서 기준으로 App Router, SSR, Route Handler, Server Actions를 지원한다. 별도 오래된 어댑터를 고정하지 않고 OpenNext 기반 자동 런타임을 사용한다.

참고:

- https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/
- https://www.netlify.com/changelog/

## 설정

- Build command: `npm run build`
- Publish directory: `.next`
- Node version: `22`
- Static export 사용 안 함

환경변수:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_NAME
APP_TIMEZONE
NEXT_PUBLIC_SITE_URL
```

Supabase Redirect URL에는 production URL과 deploy preview URL을 모두 등록한다. 비밀번호 재설정 Redirect URL도 Netlify production URL의 `/reset-password`로 연결한다.
