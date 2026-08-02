from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        value = lv.label(screen)
        value.set_text("Value: 50")
        value.align(lv.ALIGN.CENTER, 0, -35)

        slider = lv.slider(screen)
        slider.set_width(200)
        slider.set_value(50, False)
        slider.align(lv.ALIGN.CENTER, 0, 15)

        def value_changed(event):
            value.set_text("Value: {}".format(slider.get_value()))

        slider.add_event_cb(value_changed, lv.EVENT.VALUE_CHANGED, None)
        self.setContentView(screen)
