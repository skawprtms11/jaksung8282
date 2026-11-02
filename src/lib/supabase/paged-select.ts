// PostgREST 는 한 요청에 최대 행 수(기본 1,000)까지만 돌려주므로 .range() 로 나눠 끝까지 읽는다.
// 쿼리 빌더를 받지 않고 페이지 조회 함수를 받아, 서버·테스트 어디서나 쓸 수 있다(server-only 아님).

export const SELECT_PAGE_SIZE = 1000;
const DEFAULT_MAX_ROWS = 20000;

type PageResult<T> = { data: T[] | null; error: { code?: string; message: string } | null };

// fetchPage(from, to) 는 정렬이 고정된 쿼리에 .range(from, to) 를 붙여 돌려줘야 한다(페이지 사이 누락·중복 방지).
export async function selectAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  { label, maxRows = DEFAULT_MAX_ROWS, pageSize = SELECT_PAGE_SIZE }: { label: string; maxRows?: number; pageSize?: number }
): Promise<PageResult<T> & { data: T[] }> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      return { data: rows, error };
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) {
      return { data: rows, error: null };
    }
    if (rows.length >= maxRows) {
      console.warn(`${label}: 조회 상한 ${maxRows}건에 도달해 이후 행을 읽지 않았습니다.`);
      return { data: rows, error: null };
    }
  }
}
