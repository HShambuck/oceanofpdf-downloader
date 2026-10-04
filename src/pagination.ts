export function parsePaginationFromDOM(): number | null {
  const numbers: number[] = [];

  const selectors = [
    '.page-numbers',
    'a.page-numbers',
    'span.page-numbers',
    '.pagination a',
    '.nav-links a',
    '.wp-pagenavi a'
  ];

  selectors.forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      const text = el.textContent?.replace(/,/g, '').trim() || '';
      const num = parseInt(text, 10);
      if (!isNaN(num)) numbers.push(num);
    });
  });

  const bodyText = document.body.innerText || '';
  const match = bodyText.match(/Page\s+\d+\s+of\s+(\d+)/i);
  if (match && match[1]) {
    const total = parseInt(match[1], 10);
    if (!isNaN(total)) numbers.push(total);
  }

  return numbers.length > 0 ? Math.max(...numbers) : null;
}