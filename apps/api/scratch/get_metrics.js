const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const allMetrics = await prisma.runMetric.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  if (allMetrics.length === 0) {
    console.log("No metrics found.");
    return;
  }

  // The metrics are already mostly from the latest run, but let's group them properly
  // Since we don't have workflowId in RunMetric directly, we can use the run's workflowId
  // For this report, we'll just take the unique nodes from the most recent cluster.
  
  console.log("CORTEXA PERFORMANCE METRICS REPORT");
  console.log("=================================================");

  const tableData = [];
  let totalLatencyMs = 0;

  // We'll iterate through the last 8 entries (our current DAG size)
  const recentMetrics = allMetrics.slice(0, 8).reverse();

  recentMetrics.forEach(m => {
    const latencyS = m.latencyMs / 1000;
    totalLatencyMs += m.latencyMs;

    tableData.push({
      Node: m.nodeId,
      Model: m.model || "N/A",
      Latency: latencyS.toFixed(2) + "s",
      Attempt: m.attempt,
      Result: m.success ? "SUCCESS" : "FAILED"
    });
  });

  console.table(tableData);
  console.log("=================================================");
  console.log("Aggregated Pipeline Latency: " + (totalLatencyMs / 1000).toFixed(2) + "s");
  console.log("Average Node Latency: " + (totalLatencyMs / 8 / 1000).toFixed(2) + "s");
  console.log("=================================================");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
