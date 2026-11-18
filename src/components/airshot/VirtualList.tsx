'use client'

// AirShot — VirtualList (§5.3): virtualización con umbral 50 (app.config: constante
// de rendimiento UI — valor y motivo declarados) y claves UUID vía getItemKey
// (nunca índices); medición dinámica por elemento (measureElement).
// Accesibilidad: roving tabindex implícito por DOM; aria-rowcount no aplica fuera
// de tabla — se declara role list/listitem.

import { Fragment, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export const VIRTUALIZE_THRESHOLD = 50 // §5.3: umbral justificado (DOM y payload por tarjeta)

export function VirtualList<T extends { id: string }>({
  items,
  estimateSize,
  renderItem,
  className,
}: {
  items: T[]
  estimateSize: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
}) {
  const parentRef = useRef<HTMLDivElement | null>(null)
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? `sentinel-${index}`, // claves UUID estables
  })
  return (
    <div
      ref={parentRef}
      className={className ?? 'max-h-[70vh] overflow-y-auto'}
      role="list"
      aria-label="Lista virtualizada"
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index]
          if (item === undefined) return null
          return (
            <div
              key={virtualItem.key}
              role="listitem"
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Renderiza lista normal bajo el umbral y virtualizada por encima (misma fuente). */
export function ListOrVirtual<T extends { id: string }>({
  items,
  estimateSize,
  renderItem,
  className,
  plainClassName,
}: {
  items: T[]
  estimateSize: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  plainClassName?: string
}) {
  if (items.length > VIRTUALIZE_THRESHOLD) {
    return <VirtualList items={items} estimateSize={estimateSize} renderItem={renderItem} className={className} />
  }
  return (
    <div className={plainClassName ?? 'space-y-4'}>
      {items.map((item, index) => (
        <Fragment key={item.id}>{renderItem(item, index)}</Fragment>
      ))}
    </div>
  )
}
