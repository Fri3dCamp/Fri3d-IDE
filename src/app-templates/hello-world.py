from mpos import Activity
import lvgl as lv


class Main(Activity):
    def onCreate(self):
        screen = lv.obj()
        label = lv.label(screen)
        label.set_text("Hello from {{APP_NAME}}!")
        label.center()
        self.setContentView(screen)
