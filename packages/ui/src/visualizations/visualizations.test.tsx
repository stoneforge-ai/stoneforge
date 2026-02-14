/**
 * Visualization Components Tests
 */

import { describe, test, expect } from 'bun:test';
import {
  StatusPieChart,
  TrendLineChart,
  HorizontalBarChart,
  type PieChartDataPoint,
  type LineChartDataPoint,
  type BarChartDataPoint,
  type ChartColors,
} from './index';

// Note: We're testing the component interfaces and type exports here.
// Full rendering tests would require a DOM environment like jsdom.

describe('Visualization Types', () => {
  describe('PieChartDataPoint', () => {
    test('should accept minimal data point', () => {
      const dataPoint: PieChartDataPoint = {
        name: 'Open',
        value: 10,
      };
      expect(dataPoint.name).toBe('Open');
      expect(dataPoint.value).toBe(10);
    });

    test('should accept full data point with key and color', () => {
      const dataPoint: PieChartDataPoint = {
        name: 'In Progress',
        value: 5,
        key: 'in_progress',
        color: '#eab308',
      };
      expect(dataPoint.key).toBe('in_progress');
      expect(dataPoint.color).toBe('#eab308');
    });
  });

  describe('LineChartDataPoint', () => {
    test('should accept minimal data point', () => {
      const dataPoint: LineChartDataPoint = {
        label: 'Monday',
        value: 3,
      };
      expect(dataPoint.label).toBe('Monday');
      expect(dataPoint.value).toBe(3);
    });

    test('should accept full data point with date', () => {
      const dataPoint: LineChartDataPoint = {
        label: 'Today',
        value: 5,
        date: '2025-01-31',
      };
      expect(dataPoint.date).toBe('2025-01-31');
    });
  });

  describe('BarChartDataPoint', () => {
    test('should accept minimal data point', () => {
      const dataPoint: BarChartDataPoint = {
        name: 'Agent Alpha',
        value: 10,
      };
      expect(dataPoint.name).toBe('Agent Alpha');
      expect(dataPoint.value).toBe(10);
    });

    test('should accept full data point', () => {
      const dataPoint: BarChartDataPoint = {
        name: 'Agent Beta',
        value: 8,
        id: 'agent-beta-123',
        percentage: 25,
        secondaryValue: 2,
      };
      expect(dataPoint.id).toBe('agent-beta-123');
      expect(dataPoint.percentage).toBe(25);
    });
  });

  describe('ChartColors', () => {
    test('should accept color map', () => {
      const colors: ChartColors = {
        colorMap: {
          open: '#3b82f6',
          in_progress: '#eab308',
          blocked: '#ef4444',
          closed: '#22c55e',
        },
      };
      expect(colors.colorMap?.open).toBe('#3b82f6');
    });

    test('should accept default colors array', () => {
      const colors: ChartColors = {
        defaultColors: ['#3b82f6', '#eab308', '#ef4444'],
      };
      expect(colors.defaultColors?.length).toBe(3);
    });

    test('should accept primary color', () => {
      const colors: ChartColors = {
        primaryColor: '#3b82f6',
      };
      expect(colors.primaryColor).toBe('#3b82f6');
    });
  });
});

describe('StatusPieChart', () => {
  test('should be a function', () => {
    expect(typeof StatusPieChart).toBe('function');
  });

  test('should accept required props', () => {
    const props = {
      data: [
        { name: 'Open', value: 10 },
        { name: 'Closed', value: 5 },
      ] as PieChartDataPoint[],
    };
    // Type check that props are valid
    expect(props.data.length).toBe(2);
  });

  test('should accept all optional props', () => {
    const props = {
      data: [{ name: 'Test', value: 1 }] as PieChartDataPoint[],
      title: 'Tasks by Status',
      testId: 'tasks-by-status-chart',
      isLoading: false,
      isError: false,
      errorMessage: 'Custom error',
      emptyMessage: 'No tasks',
      height: 200,
      innerRadius: 35,
      outerRadius: 60,
      showLabels: true,
      isMobile: false,
      isTouchDevice: false,
      onLegendClick: (key: string) => console.log(key),
      className: 'custom-class',
      colors: {
        colorMap: { test: '#ff0000' },
      },
    };
    expect(props.title).toBe('Tasks by Status');
    expect(props.colors?.colorMap?.test).toBe('#ff0000');
  });
});

describe('TrendLineChart', () => {
  test('should be a function', () => {
    expect(typeof TrendLineChart).toBe('function');
  });

  test('should accept required props', () => {
    const props = {
      data: [
        { label: 'Mon', value: 3 },
        { label: 'Tue', value: 5 },
        { label: 'Wed', value: 2 },
      ] as LineChartDataPoint[],
    };
    expect(props.data.length).toBe(3);
  });

  test('should accept all optional props', () => {
    const props = {
      data: [{ label: 'Today', value: 1 }] as LineChartDataPoint[],
      title: 'Tasks Completed (Last 7 Days)',
      lineColor: '#22c55e',
      showGrid: true,
      showDots: true,
      total: 15,
      testId: 'tasks-completed-chart',
      isLoading: false,
      isError: false,
      errorMessage: 'Failed to load',
      emptyMessage: 'No data',
      height: 192,
      isMobile: false,
      isTouchDevice: false,
      className: 'trend-chart',
    };
    expect(props.lineColor).toBe('#22c55e');
    expect(props.total).toBe(15);
  });
});

describe('HorizontalBarChart', () => {
  test('should be a function', () => {
    expect(typeof HorizontalBarChart).toBe('function');
  });

  test('should accept required props', () => {
    const props = {
      data: [
        { name: 'Alice', value: 10 },
        { name: 'Bob', value: 8 },
        { name: 'Carol', value: 6 },
      ] as BarChartDataPoint[],
    };
    expect(props.data.length).toBe(3);
  });

  test('should accept all optional props', () => {
    const clickedItems: BarChartDataPoint[] = [];
    const props = {
      data: [{ name: 'Test Agent', value: 5, id: 'agent-1' }] as BarChartDataPoint[],
      title: 'Workload by Agent',
      barColor: '#3b82f6',
      onBarClick: (dataPoint: BarChartDataPoint) => clickedItems.push(dataPoint),
      maxBars: 10,
      testId: 'workload-by-agent-chart',
      isLoading: false,
      isError: false,
      errorMessage: 'Error loading',
      emptyMessage: 'No agents',
      height: 192,
      isMobile: false,
      isTouchDevice: false,
      className: 'workload-chart',
    };
    expect(props.maxBars).toBe(10);
    expect(typeof props.onBarClick).toBe('function');
  });

  test('should handle bar click callback', () => {
    const clickedItems: BarChartDataPoint[] = [];
    const onBarClick = (dataPoint: BarChartDataPoint) => clickedItems.push(dataPoint);

    const testData: BarChartDataPoint = {
      name: 'Test Agent',
      value: 5,
      id: 'agent-123',
      percentage: 25,
    };

    onBarClick(testData);

    expect(clickedItems.length).toBe(1);
    expect(clickedItems[0].id).toBe('agent-123');
  });
});

describe('Visualization Exports', () => {
  test('should export StatusPieChart', () => {
    expect(StatusPieChart).toBeDefined();
  });

  test('should export TrendLineChart', () => {
    expect(TrendLineChart).toBeDefined();
  });

  test('should export HorizontalBarChart', () => {
    expect(HorizontalBarChart).toBeDefined();
  });
});

describe('Sample Data Structures', () => {
  test('should support task status data structure', () => {
    const tasksByStatus: PieChartDataPoint[] = [
      { name: 'Open', value: 10, key: 'open', color: '#3b82f6' },
      { name: 'In Progress', value: 5, key: 'in_progress', color: '#eab308' },
      { name: 'Blocked', value: 2, key: 'blocked', color: '#ef4444' },
      { name: 'Completed', value: 15, key: 'closed', color: '#22c55e' },
    ];

    const total = tasksByStatus.reduce((sum, d) => sum + d.value, 0);
    expect(total).toBe(32);
    expect(tasksByStatus.filter(d => d.value > 0).length).toBe(4);
  });

  test('should support completed over time data structure', () => {
    const completedOverTime: LineChartDataPoint[] = [
      { label: 'Mon', value: 3, date: '2025-01-27' },
      { label: 'Tue', value: 5, date: '2025-01-28' },
      { label: 'Wed', value: 2, date: '2025-01-29' },
      { label: 'Thu', value: 4, date: '2025-01-30' },
      { label: 'Today', value: 6, date: '2025-01-31' },
    ];

    const total = completedOverTime.reduce((sum, d) => sum + d.value, 0);
    expect(total).toBe(20);
  });

  test('should support workload by agent data structure', () => {
    const workloadByAgent: BarChartDataPoint[] = [
      { name: 'Alice', value: 10, id: 'alice-123', percentage: 40 },
      { name: 'Bob', value: 8, id: 'bob-456', percentage: 32 },
      { name: 'Carol', value: 7, id: 'carol-789', percentage: 28 },
    ];

    const totalPercentage = workloadByAgent.reduce((sum, d) => sum + (d.percentage || 0), 0);
    expect(totalPercentage).toBe(100);
  });
});
