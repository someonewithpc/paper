import { useState } from 'react';

import { PaperBook, PaperStack, usePaper } from '@hsal/paper/react';

import { bookPages, pageText, stackPages } from '../content.js';

export function App() {
  const [shown, setShown] = useState(true);
  const [changes, setChanges] = useState(0);
  const stack = usePaper();
  const book = usePaper<'book'>();
  return (
    <>
      <p><button type="button" id="toggle" onClick={() => setShown(!shown)}>{shown ? 'Unmount' : 'Mount'}</button></p>
      {shown && (
        <>
          <PaperStack ref={stack.ref} id="stack" label="React stack" className="demo-stack" onChange={() => setChanges((n) => n + 1)}>
            {stackPages.map((title) => <section key={title} className="demo-page"><h2>{title}</h2><p>{pageText}</p></section>)}
          </PaperStack>
          <PaperBook ref={book.ref} id="book" label="React book" className="demo-book" display="double" onChange={() => setChanges((n) => n + 1)}>
            {bookPages.map((title) => <section key={title} className="demo-leaf"><h2>{title}</h2><p>{pageText}</p></section>)}
          </PaperBook>
        </>
      )}
      <p>
        Stack page <output id="stack-state">{stack.state ? stack.state.index : 'none'}</output>,
        book spread <output id="book-state">{book.state ? book.state.spread : 'none'}</output>,
        changes <output id="changes">{changes}</output>
      </p>
    </>
  );
}
