export function parsePaginationFromDOM(): number | null {
  const numbers: number[] = [];

  // Check standard pagination anchors and text containers
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

  // Fallback: Parse explicit text patterns like "Page 1 of 231"
  const bodyText = document.body.innerText || '';
  const match = bodyText.match(/Page\s+\d+\s+of\s+(\d+)/i);
  if (match && match[1]) {
    const total = parseInt(match[1], 10);
    if (!isNaN(total)) numbers.push(total);
  }

  return numbers.length > 0 ? Math.max(...numbers) : null;
}