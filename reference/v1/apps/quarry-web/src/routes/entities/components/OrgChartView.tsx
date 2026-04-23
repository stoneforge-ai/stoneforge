/**
 * OrgChartView - Simple org chart visualization showing entity and direct reports
 */

import { ENTITY_TYPE_STYLES } from '../constants';
import type { Entity } from '../types';

interface OrgChartViewProps {
  rootEntity: Entity;
  directReports: Entity[];
  onEntityClick: (id: string) => void;
}

export function OrgChartView({ rootEntity, directReports, onEntityClick }: OrgChartViewProps) {
  const styles = ENTITY_TYPE_STYLES[rootEntity.entityType] || ENTITY_TYPE_STYLES.system;
  const Icon = styles.icon;

  return (
    <div className="p-3 bg-gray-50 rounded-lg" data-testid="org-chart-view">
      {/* Root entity (current) */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg shadow-sm border border-gray-200 mb-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${styles.bg}`}>
            <Icon className={`w-4 h-4 ${styles.text}`} />
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{rootEntity.name}</div>
            <div className="text-xs text-gray-500">{rootEntity.entityType}</div>
          </div>
        </div>

        {/* Connector line */}
        {directReports.length > 0 && (
          <div className="w-px h-4 bg-gray-300" />
        )}

        {/* Horizontal connector */}
        {directReports.length > 1 && (
          <div
            className="h-px bg-gray-300 mb-2"
            style={{ width: `${Math.min(directReports.length * 120, 400)}px` }}
          />
        )}

        {/* Direct reports */}
        {directReports.length > 0 && (
          <div className="flex flex-wrap justify-center gap-3">
            {directReports.map((report) => {
              const reportStyles = ENTITY_TYPE_STYLES[report.entityType] || ENTITY_TYPE_STYLES.system;
              const ReportIcon = reportStyles.icon;

              return (
                <button
                  key={report.id}
                  onClick={() => onEntityClick(report.id)}
                  className="flex flex-col items-center p-2 bg-white rounded-lg shadow-sm border border-gray-200 hover:border-blue-300 hover:shadow transition-all"
                  data-testid={`org-chart-report-${report.id}`}
                >
                  {/* Vertical connector */}
                  <div className="w-px h-2 bg-gray-300 -mt-4 mb-1" />
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${reportStyles.bg}`}>
                    <ReportIcon className={`w-4 h-4 ${reportStyles.text}`} />
                  </div>
                  <div className="text-xs font-medium text-gray-900 mt-1 max-w-[80px] truncate">
                    {report.name}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
