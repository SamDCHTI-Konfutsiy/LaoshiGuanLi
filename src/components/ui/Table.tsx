import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export function Table(props: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table {...props} className={'w-full text-sm ' + (props.className ?? '')} />
    </div>
  );
}

export function Thead(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead {...props} className={'bg-surface-raised ' + (props.className ?? '')} />;
}

export function Tbody(props: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody {...props} className={'divide-y divide-border ' + (props.className ?? '')} />;
}

export function Tr(props: HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...props} />;
}

export function Th(props: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      {...props}
      className={'px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide text-text-muted ' + (props.className ?? '')}
    />
  );
}

export function Td(props: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...props} className={'px-4 py-3 align-middle ' + (props.className ?? '')} />;
}
