import Icon from '../common/Icon';

/**
 * Renders one section's body from the translation bundle.
 *
 * Legal copy is data, not markup: `legal.json` describes each section as a list of
 * blocks, and this is the only place that knows what a block looks like. That is
 * what lets five very different policies — shipping, returns, terms, privacy,
 * refunds — share one page shell and stay visually identical, and what lets a
 * translator add a paragraph without touching a component.
 *
 *   { type: 'p',     text }                 a paragraph
 *   { type: 'ul',    items[] }              a bulleted list
 *   { type: 'ol',    items[] }              a numbered list, for ordered processes
 *   { type: 'note',  text }                 a highlighted aside
 *   { type: 'table', head[], rows[][] }     a comparison table
 */

function Paragraph({ text }) {
  return <p className="text-sm leading-relaxed text-ink-600">{text}</p>;
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-sm leading-relaxed text-ink-600">
          <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }) {
  return (
    <ol className="space-y-3">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-sm leading-relaxed text-ink-600">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
            {index + 1}
          </span>
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Note({ text }) {
  return (
    <div className="flex gap-3 rounded-lg border border-brand-100 bg-brand-50/60 px-4 py-3.5">
      <Icon name="info" size={17} className="mt-0.5 shrink-0 text-brand-600" />
      <p className="text-sm leading-relaxed text-ink-700">{text}</p>
    </div>
  );
}

/**
 * Tables carry the numbers a shopper scans for — delivery charges, refund
 * timelines, retention periods. Wide ones scroll inside their own box rather than
 * pushing the page sideways on a phone.
 */
function Table({ head, rows }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                scope="col"
                className="border border-ink-200 bg-ink-50 px-3.5 py-2.5 font-semibold text-ink-700"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={`border border-ink-200 px-3.5 py-2.5 align-top leading-relaxed ${
                    cellIndex === 0 ? 'font-medium text-ink-800' : 'text-ink-600'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PolicyBlocks({ blocks = [] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'ul') return <BulletList key={index} items={block.items || []} />;
        if (block.type === 'ol') return <NumberedList key={index} items={block.items || []} />;
        if (block.type === 'note') return <Note key={index} text={block.text} />;
        if (block.type === 'table') {
          return <Table key={index} head={block.head || []} rows={block.rows || []} />;
        }
        return <Paragraph key={index} text={block.text} />;
      })}
    </div>
  );
}
