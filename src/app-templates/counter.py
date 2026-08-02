from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        self.count = 0
        value = lv.label(screen)
        value.set_text("Count: 0")
        value.align(lv.ALIGN.CENTER, 0, -30)

        button = lv.button(screen)
        button.align(lv.ALIGN.CENTER, 0, 25)
        caption = lv.label(button)
        caption.set_text("Add one")

        def increment(event):
            self.count += 1
            value.set_text("Count: {}".format(self.count))

        button.add_event_cb(increment, lv.EVENT.CLICKED, None)
        self.setContentView(screen)
