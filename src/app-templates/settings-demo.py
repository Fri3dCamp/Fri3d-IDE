from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        title = lv.label(screen)
        title.set_text("Settings")
        title.align(lv.ALIGN.TOP_MID, 0, 30)

        wifi_label = lv.label(screen)
        wifi_label.set_text("Wi-Fi")
        wifi_label.align(lv.ALIGN.TOP_LEFT, 35, 85)
        wifi_toggle = lv.switch(screen)
        wifi_toggle.align(lv.ALIGN.TOP_RIGHT, -35, 75)

        brightness = lv.label(screen)
        brightness.set_text("Brightness")
        brightness.align(lv.ALIGN.TOP_LEFT, 35, 145)
        slider = lv.slider(screen)
        slider.set_width(140)
        slider.set_value(60, False)
        slider.align(lv.ALIGN.TOP_RIGHT, -35, 140)
        self.setContentView(screen)
