import { Link } from "react-router-dom";

export type StudentRouteCrumb = {
  label: string;
  to?: string;
};

type StudentRouteBreadcrumbProps = {
  items: StudentRouteCrumb[];
  className?: string;
};

export default function StudentRouteBreadcrumb({ items, className = "" }: StudentRouteBreadcrumbProps) {
  const visibleItems = items.filter((item) => item.label.trim());

  if (!visibleItems.length) return null;

  return (
    <nav className={`student-route-breadcrumb ${className}`.trim()} aria-label="当前位置">
      {visibleItems.map((item, index) => {
        const isLast = index === visibleItems.length - 1;
        return (
          <span className="student-route-crumb" key={`${item.label}-${index}`}>
            <span className="student-route-slash" aria-hidden="true">/</span>
            {item.to && !isLast ? (
              <Link to={item.to}>{item.label}</Link>
            ) : (
              <span aria-current={isLast ? "page" : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
