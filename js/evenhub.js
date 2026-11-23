// PolyGlance × Even Hub — the real glasses path.
//
// Loads the vendored Even Hub SDK (@evenrealities/even_hub_sdk, MIT) and, when
// a host is present (the Even App, or the official Even Hub simulator), renders
// the same display lines the browser simulator shows into two text containers
// on the G2: a header (container 1) and a body (container 2, event capture).
// Glasses input events are mapped onto the same core actions the buttons use.
//
// In a plain browser there is no host: the bridge wait is raced against a
// short timeout and this adapter quietly steps aside. That fallback is a
// designed mode, and the page says which mode it is in (the mode chip).

const HEADER_ID = 1;
const BODY_ID = 2;

export async function initEvenHub(app, onChange, onMode) {
  let push = () => {};
  try {
    const sdk = await import('../vendor/even_hub_sdk.js');
    const bridge = await Promise.race([
      sdk.waitForEvenAppBridge(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('No Even host answered')), 1500)),
    ]);

    const header = new sdk.TextContainerProperty({
      xPosition: 0, yPosition: 0, width: 576, height: 38,
      borderWidth: 0, borderColor: 5, borderRdaius: 0, paddingLength: 6,
      containerID: HEADER_ID, containerName: 'header',
      content: 'POLYGLANCE', isEventCapture: 0,
    });
    const body = new sdk.TextContainerProperty({
      xPosition: 0, yPosition: 38, width: 576, height: 250,
      borderWidth: 0, borderColor: 5, borderRdaius: 0, paddingLength: 6,
      containerID: BODY_ID, containerName: 'body',
      content: 'Loading live odds…', isEventCapture: 1,
    });
    const result = await bridge.createStartUpPageContainer(
      new sdk.CreateStartUpPageContainer({ containerTotalNum: 2, textObject: [header, body] }),
    );
    if (result !== 0) throw new Error(`createStartUpPageContainer answered ${result}`);

    push = () => {
      const view = app.render();
      bridge.textContainerUpgrade(new sdk.TextContainerUpgrade({
        containerID: HEADER_ID, containerName: 'header', content: view.header,
      }));
      bridge.textContainerUpgrade(new sdk.TextContainerUpgrade({
        containerID: BODY_ID, containerName: 'body', content: view.lines.join('\n'),
      }));
    };

    bridge.onEvenHubEvent((event) => {
      const part = event?.textEvent || event?.listEvent || event?.sysEvent;
      if (!part) return;
      let type = part.eventType;
      if (sdk.OsEventTypeList?.fromJson) {
        const parsed = sdk.OsEventTypeList.fromJson(type);
        if (parsed !== undefined) type = parsed;
      }
      // OsEventTypeList: 0 click · 1 scroll top · 2 scroll bottom · 3 double click
      if (type === 0) app.click();
      else if (type === 3) app.doubleClick();
      else if (type === 1) app.scrollUp();
      else if (type === 2) app.scrollDown();
      else return;
      push();
      onChange();
    });

    onMode(true);
    push();
  } catch {
    onMode(false);
  }
  return { push: () => push() };
}
