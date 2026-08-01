import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("Supabase environment variables are missing.");
}

const args = new Map(
  process.argv.slice(2).map((argument) => {
    const [key, value = ""] = argument.replace(/^--/, "").split("=");
    return [key, value];
  })
);
const requestedPlan = args.get("plan");
const plan = requestedPlan === "optimized" || requestedPlan === "compare" ? requestedPlan : "legacy";
const departmentId = args.get("department") || "b634dde0-9b64-4541-8e15-ca419d2d4fdb";
const weekStartDate = args.get("week") || "2026-07-27";
const year = Number(args.get("year") || 2026);
const month = Number(args.get("month") || 7);
const previousYear = month === 1 ? year - 1 : year;
const previousMonth = month === 1 ? 12 : month - 1;
const weekOfMonth = Number(args.get("week-of-month") || 5);
const sampleCount = Math.max(3, Number(args.get("samples") || 7));

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const clientRequestSelect =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,weekly_client_report_items!inner(id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports!inner(department_id,client_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),clients(client_name)))";
const commonRequestSelect =
  "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at,department_weekly_submissions!inner(id,department_id,week_start_date,report_year,report_month,week_of_month,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content))";

function departmentQuery() {
  return supabase
    .from("departments")
    .select("id,department_name")
    .eq("is_active", true)
    .eq("id", departmentId)
    .order("sort_order")
    .order("department_name");
}

function reportSummaryQuery(includePriorityItems) {
  const select = includePriorityItems
    ? "id,department_id,client_id,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,title,content,importance,work_categories(category_name))"
    : "id,department_id,client_id";
  let query = supabase
    .from("weekly_client_reports")
    .select(select)
    .eq("week_start_date", weekStartDate)
    .is("deleted_at", null)
    .eq("department_id", departmentId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (includePriorityItems) {
    query = query.in("weekly_client_report_items.importance", ["very_high", "high"]);
  }
  return query;
}

function priorityItemsQuery() {
  return supabase
    .from("weekly_client_report_items")
    .select(
      "id,item_period,title,content,importance,work_categories(category_name),weekly_client_reports!inner(department_id,client_id,departments(department_name),clients(client_name))"
    )
    .in("importance", ["very_high", "high"])
    .eq("weekly_client_reports.week_start_date", weekStartDate)
    .is("weekly_client_reports.deleted_at", null)
    .eq("weekly_client_reports.department_id", departmentId)
    .limit(500);
}

function openRequestQueries() {
  return Promise.all([
    supabase
      .from("weekly_report_item_requests")
      .select(clientRequestSelect)
      .eq("target_type", "client_item")
      .is("deleted_at", null)
      .is("closed_at", null)
      .eq("weekly_client_report_items.weekly_client_reports.department_id", departmentId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("weekly_report_item_requests")
      .select(commonRequestSelect)
      .eq("target_type", "department_common")
      .is("deleted_at", null)
      .is("closed_at", null)
      .eq("department_weekly_submissions.department_id", departmentId)
      .order("created_at", { ascending: false })
      .limit(500)
  ]);
}

function collectionQueries(queryPlan = plan) {
  const includePriorityItems = queryPlan === "optimized";
  return [
    departmentQuery(),
    supabase
      .from("department_client_links")
      .select("department_id,client_id")
      .eq("is_active", true)
      .eq("department_id", departmentId),
    reportSummaryQuery(includePriorityItems),
    ...(includePriorityItems ? [] : [priorityItemsQuery()]),
    openRequestQueries(),
    supabase
      .from("department_weekly_submissions")
      .select("id,status,department_id,week_start_date,finalized_at")
      .eq("week_start_date", weekStartDate)
      .is("deleted_at", null)
      .eq("department_id", departmentId)
      .limit(500),
    supabase.from("work_categories").select("id,category_name").eq("is_active", true).order("sort_order")
  ];
}

function materialsQueries(queryPlan = plan) {
  return [
    ...(queryPlan === "legacy" ? [departmentQuery()] : []),
    supabase
      .from("weekly_client_reports")
      .select(
        "id,department_id,client_id,departments(department_name),clients(client_name),weekly_client_report_items(id,item_period,importance,title,content,work_categories(category_name),weekly_report_item_requests(id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,deleted_at))"
      )
      .eq("week_start_date", weekStartDate)
      .is("deleted_at", null)
      .eq("department_id", departmentId)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("department_weekly_submissions")
      .select(
        queryPlan === "optimized"
          ? "id,status,department_id,week_start_date,finalized_at,departments(department_name),department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
          : "id,status,department_id,week_start_date,finalized_at,department_weekly_contents(section_type,current_importance,current_work_category_id,current_week_content,next_importance,next_work_category_id,next_week_content)"
      )
      .eq("week_start_date", weekStartDate)
      .is("deleted_at", null)
      .eq("department_id", departmentId)
      .limit(500),
    supabase.from("work_categories").select("id,category_name").eq("is_active", true).order("sort_order"),
    supabase
      .from("weekly_report_item_requests")
      .select(
        "id,target_type,target_key,report_item_id,department_submission_id,section_type,item_period,item_sort_order,request_content,request_author_name,request_author_department_name,result_content,result_author_name,result_author_department_name,result_created_by,result_created_at,result_updated_at,closed_by,closed_author_name,closed_author_department_name,closed_at,created_by,created_at,updated_at,department_weekly_submissions!inner(department_id,week_start_date)"
      )
      .eq("target_type", "department_common")
      .eq("department_weekly_submissions.week_start_date", weekStartDate)
      .is("deleted_at", null)
      .eq("department_weekly_submissions.department_id", departmentId)
      .order("created_at")
      .limit(500)
  ];
}

function volumeTrendQuery(reportYear, reportMonth) {
  return supabase
    .from("weekly_client_reports")
    .select("id,department_id,client_id,week_of_month,weekly_volumes(volume_type,quantity,unit)")
    .eq("report_year", reportYear)
    .eq("report_month", reportMonth)
    .lte("week_of_month", weekOfMonth)
    .is("deleted_at", null)
    .eq("department_id", departmentId)
    .order("week_of_month")
    .limit(500);
}

function volumesQueries(queryPlan = plan) {
  return [
    departmentQuery(),
    ...(queryPlan === "legacy"
      ? [
          supabase
            .from("weekly_client_reports")
            .select("id,department_id,client_id,clients(client_name),weekly_volumes(volume_type,quantity,unit)")
            .eq("week_start_date", weekStartDate)
            .is("deleted_at", null)
            .eq("department_id", departmentId)
            .order("updated_at", { ascending: false })
            .limit(500)
        ]
      : []),
    volumeTrendQuery(year, month),
    volumeTrendQuery(previousYear, previousMonth)
  ];
}

async function runBatch(makeQueries, queryPlan = plan) {
  const startedAt = performance.now();
  const results = await Promise.all(makeQueries(queryPlan));
  for (const result of results.flat(2)) {
    if (result?.error) {
      throw new Error(result.error.message);
    }
  }
  return performance.now() - startedAt;
}

function percentile(sortedSamples, percentile) {
  const index = Math.min(sortedSamples.length - 1, Math.ceil(sortedSamples.length * percentile) - 1);
  return sortedSamples[index];
}

const scenarios = {
  collection: collectionQueries,
  materials: materialsQueries,
  volumes: volumesQueries
};

function summarize(name, makeQueries, queryPlan, samples) {
  const sortedSamples = [...samples].sort((left, right) => left - right);
  return {
    requests: makeQueries(queryPlan).length + (name === "collection" ? 1 : 0),
    median_ms: Number(percentile(sortedSamples, 0.5).toFixed(1)),
    p90_ms: Number(percentile(sortedSamples, 0.9).toFixed(1)),
    samples_ms: sortedSamples.map((sample) => Number(sample.toFixed(1)))
  };
}

if (plan === "compare") {
  const comparison = {};
  for (const [name, makeQueries] of Object.entries(scenarios)) {
    await runBatch(makeQueries, "legacy");
    await runBatch(makeQueries, "optimized");
    const legacySamples = [];
    const optimizedSamples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const order = index % 2 === 0 ? ["legacy", "optimized"] : ["optimized", "legacy"];
      for (const queryPlan of order) {
        const elapsed = await runBatch(makeQueries, queryPlan);
        (queryPlan === "legacy" ? legacySamples : optimizedSamples).push(elapsed);
      }
    }
    comparison[name] = {
      legacy: summarize(name, makeQueries, "legacy", legacySamples),
      optimized: summarize(name, makeQueries, "optimized", optimizedSamples)
    };
  }
  console.log(JSON.stringify({ plan, sample_count: sampleCount, results: comparison }, null, 2));
} else {
  const output = {};
  for (const [name, makeQueries] of Object.entries(scenarios)) {
    await runBatch(makeQueries);
    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      samples.push(await runBatch(makeQueries));
    }
    output[name] = summarize(name, makeQueries, plan, samples);
  }
  console.log(JSON.stringify({ plan, sample_count: sampleCount, results: output }, null, 2));
}
