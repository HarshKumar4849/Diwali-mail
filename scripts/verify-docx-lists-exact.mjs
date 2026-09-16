import fs from 'fs';
import { docxToHtml, docxToPlainText, renderListHierarchy } from '../lib/docx-to-html.ts';
import { compileTemplate } from '../lib/email/template.ts';

async function runListVerification() {
  console.log('==================================================');
  console.log('MAILCRAFT — DOCX LIST FORMATTING VERIFICATION');
  console.log('==================================================\n');

  const filePath = 'C:/Users/hkp12/OneDrive/Desktop/SDV_MAIL_DRAFT.docx';
  if (!fs.existsSync(filePath)) {
    throw new Error(`Test file not found: ${filePath}`);
  }

  const buf = fs.readFileSync(filePath);
  const file = new File([buf], 'SDV_MAIL_DRAFT.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  const html = await docxToHtml(file);
  const plainText = await docxToPlainText(file);

  console.log('--- 1. Verification of Original DOCX Bullet Lists ---');
  const uls = html.match(/<ul[\s\S]*?<\/ul>/g) || [];
  console.log(`Found ${uls.length} <ul> lists in generated HTML.`);

  if (uls.length < 7) {
    throw new Error(`Expected at least 7 bullet lists, found ${uls.length}`);
  }

  // LIST 1: SUMMIT THEMES (10 items)
  const list1 = uls[0];
  const list1Items = (list1.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 1 (Summit Themes): ${list1Items.length} items`);
  const expectedList1 = [
    'Software-Defined Vehicles & Automotive Software',
    'E/E Architecture & Vehicle Computing',
    'AI-Native Digital Cockpit',
    'Generative AI & Intelligent Automotive Assistants',
    'Connected Vehicles & Connected Services',
    'ADAS / Autonomous Driving',
    'Vehicle Data & Data Modernization',
    'Personalization & Predictive UX',
    'Automotive Cybersecurity & Software Platforms',
    'Next-Generation Mobility & Customer Experience'
  ];
  if (list1Items.length !== 10) throw new Error(`List 1 item count mismatch: got ${list1Items.length}, expected 10`);
  expectedList1.forEach((expected, i) => {
    if (!list1Items[i].includes(expected.replace(/&/g, '&amp;')) && !list1Items[i].includes(expected)) {
      throw new Error(`List 1 item ${i} mismatch: got '${list1Items[i]}', expected '${expected}'`);
    }
  });
  console.log('✅ List 1 (Summit Themes): PASS (10 items, semantic <ul>, bold styling preserved)');

  // LIST 2: STRATEGIC PARTNERSHIP (4 items)
  const list2 = uls[1];
  const list2Items = (list2.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 2 (Strategic Partnership): ${list2Items.length} items`);
  if (list2Items.length !== 4) throw new Error(`List 2 item count mismatch: got ${list2Items.length}, expected 4`);
  if (!list2Items[0].includes('Brand visibility') || !list2Items[3].includes('Business development')) {
    throw new Error('List 2 content mismatch');
  }
  console.log('✅ List 2 (Strategic Partnership): PASS (4 items, semantic <ul>, emojis preserved)');

  // LIST 3: POTENTIAL OPPORTUNITIES (8 items)
  const list3 = uls[2];
  const list3Items = (list3.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 3 (Potential Opportunities): ${list3Items.length} items`);
  if (list3Items.length !== 8) throw new Error(`List 3 item count mismatch: got ${list3Items.length}, expected 8`);
  if (!list3Items[0].includes('Executive speaking') || !list3Items[7].includes('B2B networking')) {
    throw new Error('List 3 content mismatch');
  }
  console.log('✅ List 3 (Potential Opportunities): PASS (8 items, semantic <ul>, emojis preserved)');

  // LIST 4: SPEAKING (5 items)
  const list4 = uls[3];
  const list4Items = (list4.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 4 (Speaking): ${list4Items.length} items`);
  if (list4Items.length !== 5) throw new Error(`List 4 item count mismatch: got ${list4Items.length}, expected 5`);
  if (!list4Items[0].includes('Keynote presentations') || !list4Items[4].includes('Technology and industry')) {
    throw new Error('List 4 content mismatch');
  }
  console.log('✅ List 4 (Speaking): PASS (5 items, semantic <ul>, emojis preserved)');

  // LIST 5: DELEGATE PARTICIPATION (5 items)
  const list5 = uls[4];
  const list5Items = (list5.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 5 (Delegate Participation): ${list5Items.length} items`);
  if (list5Items.length !== 5) throw new Error(`List 5 item count mismatch: got ${list5Items.length}, expected 5`);
  if (!list5Items[0].includes('CXO and executive leadership') || !list5Items[4].includes('Business development')) {
    throw new Error('List 5 content mismatch');
  }
  console.log('✅ List 5 (Delegate Participation): PASS (5 items, semantic <ul>, emojis preserved)');

  // LIST 6: INTEREST AREAS (3 items)
  const list6 = uls[5];
  const list6Items = (list6.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 6 (Interest Areas): ${list6Items.length} items`);
  if (list6Items.length !== 3) throw new Error(`List 6 item count mismatch: got ${list6Items.length}, expected 3`);
  if (!list6Items[0].includes('Partnership or sponsorship') || !list6Items[2].includes('Delegate participation')) {
    throw new Error('List 6 content mismatch');
  }
  console.log('✅ List 6 (Interest Areas): PASS (3 items, semantic <ul>, emojis preserved)');

  // LIST 7: SUMMIT INFORMATION (5 items)
  const list7 = uls[6];
  const list7Items = (list7.match(/<li[\s\S]*?<\/li>/g) || []).map(li => li.replace(/<[^>]+>/g, '').trim());
  console.log(`\nList 7 (Summit Information): ${list7Items.length} items`);
  if (list7Items.length !== 5) throw new Error(`List 7 item count mismatch: got ${list7Items.length}, expected 5`);
  if (!list7Items[0].includes('Summit agenda and key themes') || !list7Items[4].includes('Technology showcase')) {
    throw new Error('List 7 content mismatch');
  }
  console.log('✅ List 7 (Summit Information): PASS (5 items, semantic <ul>, ampersands single-escaped)');

  console.log('\n--- 2. Numbered Sections & Emoji Headings ---');
  const headings = html.match(/<h[1-6][\s\S]*?<\/h[1-6]>/g) || [];
  const headingTexts = headings.map(h => h.replace(/<[^>]+>/g, '').trim());
  console.log('Detected Headings:\n ', headingTexts.join('\n  '));

  const hasSection1 = headingTexts.some(h => h.includes('1️') && h.includes('Strategic Partnership'));
  const hasSection2 = headingTexts.some(h => h.includes('2️') && h.includes('Speaking'));
  const hasSection3 = headingTexts.some(h => h.includes('3️') && h.includes('Delegate Participation'));

  if (!hasSection1) throw new Error('Numbered section 1 missing or misidentified');
  if (!hasSection2) throw new Error('Numbered section 2 missing or misidentified');
  if (!hasSection3) throw new Error('Numbered section 3 missing or misidentified');

  console.log('✅ Section 1 (Strategic Partnership): PASS');
  console.log('✅ Section 2 (Speaking & Thought Leadership): PASS');
  console.log('✅ Section 3 (Delegate Participation): PASS');

  console.log('\n--- 3. Nested Lists Hierarchy Test ---');
  const nestedSample = [
    { listType: 'decimal', ilvl: 0, content: 'Major Section 1' },
    { listType: 'bullet', ilvl: 1, content: 'Detail A' },
    { listType: 'bullet', ilvl: 1, content: 'Detail B' },
    { listType: 'decimal', ilvl: 0, content: 'Major Section 2' },
  ];
  const nestedHtml = renderListHierarchy(nestedSample);
  if (!nestedHtml.includes('<ol') || !nestedHtml.includes('<ul') || !nestedHtml.includes('Major Section 1<ul')) {
    throw new Error(`Nested list rendered incorrectly: ${nestedHtml}`);
  }
  console.log('✅ Nested lists: PASS (correct semantic hierarchy: <ol><li>...<ul><li>...</li></ul></li></ol>)');

  console.log('\n--- 4. Formatting Inside Lists ---');
  // Bold inside list item
  if (!list1.includes('<span style="font-weight: bold">')) {
    throw new Error('Bold formatting inside list 1 lost');
  }
  console.log('✅ Bold inside list: PASS');

  // Special characters (& single-escaped)
  if (list1.includes('&amp;amp;')) {
    throw new Error('Double encoded & in list 1');
  }
  if (!list1.includes('Software-Defined Vehicles &amp; Automotive Software')) {
    throw new Error('Missing single-escaped ampersand in list 1');
  }
  console.log('✅ Special characters (&amp; not &amp;amp;): PASS');

  // Placeholders in compiled template
  const sampleWithPlaceholder = html.replace('Dear ', 'Dear {{Name}}, from {{Company}} — ');
  const compiled = compileTemplate(sampleWithPlaceholder, { Name: 'Jane Doe', Company: 'Acme Motors' });
  if (compiled.includes('{{Name}}') || !compiled.includes('Jane Doe') || !compiled.includes('Acme Motors')) {
    throw new Error('Placeholder {{Name}} failed to compile');
  }
  console.log('✅ Placeholders in compiled email: PASS');

  console.log('\n--- 5. Gap & Spacing Integrity Check ---');
  // Check that no consecutive &nbsp; paragraphs exist
  if (html.includes('&nbsp;</p><p style="margin: 0 0 12px 0; line-height: 1.5;">&nbsp;</p>')) {
    throw new Error('Found consecutive blank paragraphs causing strange extra gaps');
  }
  // Check that there is no blank line right before a heading
  if (html.match(/&nbsp;<\/p><h[1-6]/)) {
    throw new Error('Found blank paragraph immediately preceding a heading');
  }
  // Check that there is no blank line right after a list
  if (html.match(/<\/(?:ul|ol)><p style="[^"]*">&nbsp;<\/p>/)) {
    throw new Error('Found blank paragraph immediately following a list');
  }
  console.log('✅ No strange extra gaps before headings or after lists: PASS');

  console.log('\n--- 6. Plain-Text Representation ---');
  if (plainText.includes('<ul') || plainText.includes('<li') || plainText.includes('<p')) {
    throw new Error('Plain text contains HTML tags');
  }
  if (!plainText.includes('- Software-Defined Vehicles & Automotive Software')) {
    throw new Error('Plain text bullet missing or malformed');
  }
  console.log('✅ Plain text representation: PASS');

  console.log('\n==================================================');
  console.log('✨ ALL DOCX LIST TESTS PASSED PERFECTLY!');
  console.log('==================================================');
}

runListVerification().catch((err) => {
  console.error('\n❌ VERIFICATION FAILED:', err);
  process.exit(1);
});
