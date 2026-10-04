import { ICON, Svg } from "../icons";
import s from "../shell.module.css";

/** Previews only: the phone's own status bar, as the prototype draws it. */
export default function StatusBar({ android }: { android: boolean }) {
  if (android) {
    return (
      <div className={s.statusAndroid}>
        <div className={s.statusAndroidLeft}><span className={s.statusAndroidTime}>9:41</span><Svg d={ICON.bell} size={14} sw={2.2} /></div>
        <div className={s.statusAndroidCam} />
        <div className={s.statusAndroidRight}>
          <div className={s.statusAndroidWifi} />
          <div className={s.statusAndroidSignal} />
          <div className={s.statusAndroidBattery}><span className={s.statusAndroidTip} /></div>
        </div>
      </div>
    );
  }
  return (
    <div className={s.statusIos}>
      <span className={s.statusIosTime}>9:41</span>
      <div className={s.statusIosIsland} />
      <div className={s.statusIosIcons}>
        <div className={s.statusIosBars}>
          {[4, 6, 8.5, 11].map(h => <span key={h} className={s.statusIosBar} style={{ height: h }} />)}
        </div>
        <div className={s.statusIosWifi} />
        <div className={s.statusIosBattery}><div className={s.statusIosCell}><div className={s.statusIosLevel} /></div><span className={s.statusIosNub} /></div>
      </div>
    </div>
  );
}
