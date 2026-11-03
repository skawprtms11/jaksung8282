"use client";

import dynamic from "next/dynamic";

// recharts 는 물동량 탭에서만 쓰므로 첫 화면 청크에서 떼어낸다. 자리 표시는 그래프 패널과 같은 최소 높이를 쓴다.
// 서버 컴포넌트에서 next/dynamic 을 부르면 청크가 라우트 초기 로드에 묶이므로, 클라이언트 모듈에서 ssr:false 로 감싼다.
export const LazyVolumeComparisonChart = dynamic(
  () => import("@/components/charts/VolumeComparisonChart").then((mod) => mod.VolumeComparisonChart),
  {
    ssr: false,
    loading: () => (
      <section className="sketch-panel flex min-h-[320px] min-w-0 items-center justify-center p-4 text-sm font-black text-slate-500">
        물동량 그래프를 불러오는 중입니다.
      </section>
    )
  }
);
