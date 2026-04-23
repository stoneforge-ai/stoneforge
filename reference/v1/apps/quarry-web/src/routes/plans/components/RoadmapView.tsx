/**
 * RoadmapView - Timeline visualization of plans as horizontal bars
 */

import { useMemo } from 'react';
import { GanttChart } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { STATUS_CONFIG, STATUS_BAR_COLORS } from '../constants';
import type { HydratedPlan } from '../types';

interface RoadmapBarData {
  planId: string;
  title: string;
  status: string;
  startDate: Date;
  endDate: Date;
  startOffset: number;
  duration: number;
  completionPercentage: number;
}

interface RoadmapViewProps {
  plans: HydratedPlan[];
  onPlanClick: (planId: string) => void;
  selectedPlanId: string | null;
}

/**
 * Custom tooltip for roadmap bars
 */
function RoadmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: RoadmapBarData }>;
}) {
  if (!active || !payload?.length) return null;

  const data = payload[0].payload;
  const statusConfig = STATUS_CONFIG[data.status] || STATUS_CONFIG.draft;

  return (
    <div
      className="bg-white p-3 rounded-lg shadow-lg border border-gray-200 max-w-xs"
      data-testid="roadmap-tooltip"
    >
      <div className="font-medium text-gray-900 mb-1 truncate">{data.title}</div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
          {statusConfig.icon}
          {statusConfig.label}
        </span>
        <span className="text-xs text-gray-500">{data.completionPercentage}% complete</span>
      </div>
      <div className="text-xs text-gray-500">
        <div>Start: {data.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div>End: {data.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        <div>Duration: {data.duration} days</div>
      </div>
    </div>
  );
}

export function RoadmapView({ plans, onPlanClick, selectedPlanId }: RoadmapViewProps) {
  // Calculate timeline range based on plan dates
  const { timelineStart, timelineEnd, chartData, tickValues, tickFormatter } = useMemo(() => {
    if (plans.length === 0) {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      return {
        timelineStart: start,
        timelineEnd: end,
        chartData: [],
        tickValues: [],
        tickFormatter: (_dayOffset: number) => '',
      };
    }

    // Find the earliest and latest dates across all plans
    let minDate = new Date();
    let maxDate = new Date();
    let hasValidDates = false;

    plans.forEach((plan) => {
      const created = new Date(plan.createdAt);
      const updated = new Date(plan.updatedAt);
      const completed = plan.completedAt ? new Date(plan.completedAt) : null;
      const cancelled = plan.cancelledAt ? new Date(plan.cancelledAt) : null;

      const startDate = created;
      const endDate = completed || cancelled || updated;

      if (!hasValidDates) {
        minDate = new Date(startDate);
        maxDate = new Date(endDate);
        hasValidDates = true;
      } else {
        if (startDate < minDate) minDate = new Date(startDate);
        if (endDate > maxDate) maxDate = new Date(endDate);
      }
    });

    // Add padding to the timeline (7 days before, 14 days after)
    const start = new Date(minDate);
    start.setDate(start.getDate() - 7);
    const end = new Date(maxDate);
    end.setDate(end.getDate() + 14);

    // Calculate total days for the timeline
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    // Create chart data for each plan
    const data: RoadmapBarData[] = plans.map((plan) => {
      const created = new Date(plan.createdAt);
      const updated = new Date(plan.updatedAt);
      const completed = plan.completedAt ? new Date(plan.completedAt) : null;
      const cancelled = plan.cancelledAt ? new Date(plan.cancelledAt) : null;

      const startDate = created;
      const endDate = completed || cancelled || updated;

      // Calculate offset from timeline start (in days)
      const startOffset = Math.ceil((startDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      const duration = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));

      return {
        planId: plan.id,
        title: plan.title,
        status: plan.status,
        startDate,
        endDate,
        startOffset,
        duration,
        completionPercentage: plan._progress?.completionPercentage ?? 0,
      };
    });

    // Generate tick values (every 7 days)
    const ticks: number[] = [];
    for (let i = 0; i <= totalDays; i += 7) {
      ticks.push(i);
    }

    // Tick formatter
    const formatter = (dayOffset: number): string => {
      const date = new Date(start);
      date.setDate(date.getDate() + dayOffset);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return {
      timelineStart: start,
      timelineEnd: end,
      chartData: data,
      tickValues: ticks,
      tickFormatter: formatter,
    };
  }, [plans]);

  const totalDays = Math.ceil((timelineEnd.getTime() - timelineStart.getTime()) / (1000 * 60 * 60 * 24));

  if (plans.length === 0) {
    return (
      <div
        data-testid="roadmap-empty"
        className="flex flex-col items-center justify-center h-full py-12 text-center"
      >
        <GanttChart className="w-12 h-12 text-gray-300 mb-3" />
        <p className="text-gray-500">No plans to display in roadmap</p>
        <p className="text-sm text-gray-400 mt-1">Create plans to see them on the timeline</p>
      </div>
    );
  }

  // Row height for each plan bar
  const rowHeight = 48;
  const chartHeight = Math.max(200, chartData.length * rowHeight + 60);

  return (
    <div
      data-testid="roadmap-view"
      className="h-full flex flex-col bg-white rounded-lg border border-gray-200 overflow-hidden"
    >
      {/* Timeline Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {timelineStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} —{' '}
            {timelineEnd.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs text-gray-500">
            {plans.length} plan{plans.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Chart Container */}
      <div className="flex-1 overflow-auto p-4" data-testid="roadmap-chart-container">
        <div style={{ height: chartHeight, minWidth: Math.max(600, totalDays * 8) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              layout="vertical"
              barCategoryGap={8}
              margin={{ top: 20, right: 30, left: 200, bottom: 20 }}
            >
              {/* X-axis: Time (days) */}
              <XAxis
                type="number"
                dataKey="startOffset"
                domain={[0, totalDays]}
                ticks={tickValues}
                tickFormatter={tickFormatter}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={{ stroke: '#e5e7eb' }}
                tick={{ fontSize: 11, fill: '#6b7280' }}
              />

              {/* Y-axis: Plan titles */}
              <YAxis
                type="category"
                dataKey="title"
                width={190}
                axisLine={{ stroke: '#e5e7eb' }}
                tickLine={false}
                tick={({ x, y, payload }) => (
                  <g transform={`translate(${x},${y})`}>
                    <text
                      x={-5}
                      y={0}
                      dy={4}
                      textAnchor="end"
                      fill="#374151"
                      fontSize={12}
                      fontWeight={500}
                      style={{ cursor: 'pointer' }}
                    >
                      {(payload.value as string).length > 25
                        ? (payload.value as string).slice(0, 22) + '...'
                        : payload.value}
                    </text>
                  </g>
                )}
              />

              <Tooltip
                content={<RoadmapTooltip />}
                cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
              />

              {/* Custom bar that accounts for offset */}
              <Bar
                dataKey="duration"
                radius={[4, 4, 4, 4]}
                style={{ cursor: 'pointer' }}
                onClick={(data) => {
                  const barData = data as unknown as RoadmapBarData;
                  if (barData?.planId) {
                    onPlanClick(barData.planId);
                  }
                }}
              >
                {chartData.map((entry) => (
                  <Cell
                    key={entry.planId}
                    fill={STATUS_BAR_COLORS[entry.status] || STATUS_BAR_COLORS.draft}
                    stroke={selectedPlanId === entry.planId ? '#1d4ed8' : 'transparent'}
                    strokeWidth={selectedPlanId === entry.planId ? 2 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-center gap-6" data-testid="roadmap-legend">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div key={status} className="flex items-center gap-1.5 text-xs">
              <span
                className="w-3 h-3 rounded"
                style={{ backgroundColor: STATUS_BAR_COLORS[status] }}
              />
              <span className="text-gray-600">{config.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
