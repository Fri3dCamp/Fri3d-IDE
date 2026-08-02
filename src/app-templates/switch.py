from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        title = lv.label(screen)
        title.set_text("Feature is off")
        title.align(lv.ALIGN.CENTER, 0, -35)

        toggle = lv.switch(screen)
        toggle.align(lv.ALIGN.CENTER, 0, 20)

        def toggle_changed(event):
            if toggle.has_state(lv.STATE.CHECKED):
                title.set_text("Feature is on")
            else:
                title.set_text("Feature is off")

        toggle.add_event_cb(toggle_changed, lv.EVENT.VALUE_CHANGED, None)
        self.setContentView(screen)
