import { useEffect, useState } from 'react';
import { useLanguage } from '../../contexts/LanguageContext';
import { buildOrgTreeEmployees, fetchDepartments, subscribeToDataChanges } from '../../utils/data';
import type { Department, Employee } from '../../types';
import { ProfileAvatar } from '../../components/ProfileAvatar';
import { PageInfoButton } from '../../components/PageInfoButton';

type OrgNode = {
  employee: Employee;
  children: OrgNode[];
};

const cardWidth = 280;
const nodeGap = 48;
const branchHeight = 44;

export function OrgChart() {
  const { t } = useLanguage();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [nameFilter, setNameFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [selectedManagerId, setSelectedManagerId] = useState('');
  const [rootManagerId, setRootManagerId] = useState('');

  useEffect(() => {
    const loadData = async () => {
      const [employeeItems, departmentItems] = await Promise.all([
        buildOrgTreeEmployees(),
        fetchDepartments(),
      ]);
      setEmployees(employeeItems);
      setDepartments(departmentItems);
    };

    loadData();
    return subscribeToDataChanges(loadData);
  }, []);

  const managerIds = new Set(employees.map((employee) => employee.managerId).filter(Boolean));
  const managers = employees.filter((employee) => managerIds.has(employee.id));
  const filteredManagers = managers.filter((manager) => {
    const query = nameFilter.toLowerCase();
    const matchesName = manager.name.toLowerCase().includes(query) ||
      (manager.employeeCode ?? '').toLowerCase().includes(query);
    const matchesDepartment = !departmentFilter || manager.department === departmentFilter;
    return matchesName && matchesDepartment;
  });

  const buildNode = (employee: Employee): OrgNode => ({
    employee,
    children: employees
      .filter((child) => child.managerId === employee.id)
      .map((child) => buildNode(child)),
  });

  const leafCount = (node: OrgNode): number => (
    node.children.length === 0
      ? 1
      : node.children.reduce((total, child) => total + leafCount(child), 0)
  );

  const subtreeWidth = (node: OrgNode) => {
    const leaves = leafCount(node);
    return leaves * cardWidth + Math.max(leaves - 1, 0) * nodeGap;
  };

  const rootManager = employees.find((employee) => employee.id === rootManagerId);
  const orgTree = rootManager ? buildNode(rootManager) : null;
  const departmentLabel = (employee: Employee) => employee.departmentId ? employee.department : t('noDepartment');

  const EmployeeNode = ({ node }: { node: OrgNode }) => {
    const hasChildren = node.children.length > 0;
    const width = subtreeWidth(node);
    const childWidths = node.children.map((child) => subtreeWidth(child));
    const childCenters = childWidths.reduce<number[]>((centers, childWidth, index) => {
      const previousWidth = childWidths.slice(0, index).reduce((total, current) => total + current, 0);
      centers.push(previousWidth + index * nodeGap + childWidth / 2);
      return centers;
    }, []);
    const firstChildCenter = childCenters[0] ?? 0;
    const lastChildCenter = childCenters[childCenters.length - 1] ?? 0;

    return (
      <div className="flex flex-col items-center" style={{ width }}>
        <div className="relative w-[280px] rounded-2xl border-2 border-white/70 bg-white/75 p-5 pt-7 shadow-xl shadow-cyan-500/30 backdrop-blur-xl dark:border-cyan-400/40 dark:bg-cyan-950/55">
          <div className="aero-department-badge absolute -top-4 left-1/2 z-20 max-w-[240px] -translate-x-1/2 justify-center">
            <span className="block truncate">{departmentLabel(node.employee)}</span>
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 rounded-t-2xl bg-gradient-to-b from-white/75 to-transparent"></div>

          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="rounded-2xl bg-gradient-to-b from-cyan-300 to-blue-600 p-2 shadow-xl shadow-cyan-500/40">
              <ProfileAvatar src={node.employee.avatarUrl} name={node.employee.name} className="h-20 w-20 rounded-xl text-xl ring-4 ring-white/70" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-bold text-cyan-900 dark:text-cyan-100">{node.employee.name}</h3>
              <p className="text-sm font-semibold text-cyan-700 dark:text-cyan-300">{node.employee.position || '-'}</p>
              <p className="mt-1 text-xs font-medium text-cyan-600 dark:text-cyan-400">{node.employee.employeeCode || t('noCode')}</p>
            </div>
          </div>
        </div>

        {hasChildren && (
          <div className="relative flex flex-col items-center" style={{ width }}>
            <div className="h-11 w-1 rounded-full bg-gradient-to-b from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/50"></div>
            <div className="relative" style={{ width, height: branchHeight }}>
              {node.children.length > 1 && (
                <div
                  className="absolute top-0 h-1 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-cyan-400 shadow-lg shadow-cyan-500/40"
                  style={{ left: firstChildCenter, width: lastChildCenter - firstChildCenter }}
                ></div>
              )}
              {childCenters.map((center, index) => (
                <div
                  key={node.children[index].employee.id}
                  className="absolute top-0 w-1 rounded-full bg-gradient-to-b from-blue-600 to-cyan-400 shadow-lg shadow-cyan-500/50"
                  style={{ left: center, height: branchHeight, transform: 'translateX(-50%)' }}
                ></div>
              ))}
            </div>
            <div className="flex" style={{ gap: nodeGap }}>
              {node.children.map((child) => (
                <EmployeeNode key={child.employee.id} node={child} />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="relative space-y-6 pt-14">
      <PageInfoButton title={t('orgChart')} description={t('orgChartInfo')} />

      <div className="aero-glass space-y-4 p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            placeholder={t('filterByManager')}
            className="aero-input w-full text-black placeholder:text-black dark:text-cyan-100 dark:placeholder:text-cyan-200"
          />
          <select
            value={departmentFilter}
            onChange={(event) => setDepartmentFilter(event.target.value)}
            className="aero-input w-full text-black dark:text-cyan-100"
          >
            <option value="">{t('allDepartments')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.name}>{department.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={!selectedManagerId}
            onClick={() => setRootManagerId(selectedManagerId)}
            className="relative overflow-hidden rounded-xl border-2 border-white/40 border-t-white/60 bg-gradient-to-b from-cyan-400 to-blue-600 px-6 py-3 font-bold text-white shadow-xl shadow-cyan-500/50 transition-all disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-50"></div>
            <span className="relative z-10">{t('generateOrgChart')}</span>
          </button>
        </div>

        <div className="max-h-80 overflow-auto rounded-xl border border-cyan-300/40 bg-white/35 dark:bg-cyan-950/20">
          {filteredManagers.length === 0 ? (
            <p className="p-4 font-medium text-cyan-700 dark:text-cyan-300">{t('noManagersMatch')}</p>
          ) : (
            filteredManagers.map((manager) => (
              <button
                key={manager.id}
                type="button"
                onClick={() => setSelectedManagerId(manager.id)}
                className={`w-full border-b border-cyan-300/20 px-4 py-3 text-left last:border-b-0 ${
                  selectedManagerId === manager.id
                    ? 'bg-cyan-200/70 dark:bg-cyan-800/60'
                    : 'hover:bg-cyan-100/60 dark:hover:bg-cyan-800/40'
                }`}
              >
                <span className="block font-bold text-cyan-900 dark:text-cyan-100">{manager.name}</span>
                <span className="block text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                  {departmentLabel(manager)} | {manager.position || t('manager')} | {manager.employeeCode || t('noCode')}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {orgTree && (
        <div className="aero-glass overflow-x-auto p-12">
          <div className="inline-flex min-w-full justify-center pb-8">
            <EmployeeNode node={orgTree} />
          </div>
        </div>
      )}
    </div>
  );
}
