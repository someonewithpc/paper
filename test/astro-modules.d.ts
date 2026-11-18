// What tsc sees of an .astro import in the tests; Astro's own tooling types them in a project.
declare module '*.astro' {
  type Container = import('astro/container').experimental_AstroContainer;
  const component: Parameters<Container['renderToString']>[0];
  export default component;
}
